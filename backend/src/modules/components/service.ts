import { z } from 'zod';
import { AppContext } from '../../context';
import { Queryable, json, many, one } from '../../db/pool';
import { HttpError, forbidden, notFound, unprocessable } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { ATTRIBUTE_MAP, SPEC_KEY_RE } from './attributes';
import { SpecValue, Specs, manualSpec } from './specs';
import { parseQuantity } from './units';

export interface ComponentRow {
  id: string;
  source: 'api' | 'custom';
  owner_id: string | null;
  mpn: string;
  manufacturer: string;
  name: string;
  category: string;
  description: string;
  package_type: string;
  datasheet_url: string;
  lifecycle_status: string;
  stock: number | null;
  price: number | null;
  specs: Specs;
  created_at: string;
  updated_at: string;
}

export interface SupplyRisk {
  level: 'none' | 'warning' | 'high';
  reasons: string[];
}

/** Supply Chain Risk Indicator: EOL / NRND lifecycle or low stock. */
export function supplyRisk(c: Pick<ComponentRow, 'lifecycle_status' | 'stock'>): SupplyRisk {
  const reasons: string[] = [];
  let level: SupplyRisk['level'] = 'none';
  const life = c.lifecycle_status.toLowerCase();
  if (['eol', 'obsolete', 'discontinued'].includes(life)) { level = 'high'; reasons.push('End of life'); }
  else if (['nrnd', 'last_time_buy'].includes(life)) { level = 'warning'; reasons.push('Not recommended for new designs'); }
  if (c.stock !== null && c.stock === 0) { level = 'high'; reasons.push('Out of stock'); }
  else if (c.stock !== null && c.stock < 100) { if (level === 'none') level = 'warning'; reasons.push('Low stock'); }
  return { level, reasons };
}

export const componentDto = (c: ComponentRow) => ({ ...c, supply_risk: supplyRisk(c) });

/** API parts are shared; custom parts are private to their creator. */
export async function getVisibleComponent(q: Queryable, id: string, userId?: string): Promise<ComponentRow> {
  const c = await one<ComponentRow>(q, 'select * from components where id = $1', [id]);
  if (!c || (c.source === 'custom' && c.owner_id !== userId)) throw notFound('Component', 'COMPONENT_NOT_FOUND');
  return c;
}

export const searchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(40).optional(),
  manufacturer: z.string().trim().max(80).optional(),
  /** Parametric filters: spec=voltage_max:gte:5  (ops: gte, lte, eq) */
  spec: z.union([z.string(), z.array(z.string())]).optional(),
  source: z.enum(['api', 'custom']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

function parseSpecFilters(spec: string | string[] | undefined) {
  return (spec === undefined ? [] : Array.isArray(spec) ? spec : [spec]).map((s) => {
    const [key, op, raw] = s.split(':');
    const value = Number(raw);
    if (!SPEC_KEY_RE.test(key ?? '') || !['gte', 'lte', 'eq'].includes(op) || !Number.isFinite(value)) {
      throw unprocessable('INVALID_FILTER', `Bad spec filter "${s}", expected key:gte|lte|eq:number`);
    }
    return { key, op: op as 'gte' | 'lte' | 'eq', value };
  });
}

export async function searchLibrary(ctx: AppContext, userId: string | undefined, params: z.infer<typeof searchQuery>) {
  const warnings: string[] = [];
  const q = params.q?.trim();

  // Pull fresh distributor data first so local results include it.
  if (q && params.source !== 'custom') {
    try {
      await ctx.distributor.search(q, 10);
    } catch (e) {
      if (e instanceof HttpError && (e.status === 502 || e.status === 429)) warnings.push(e.message);
      else throw e;
    }
  }

  const where = [`(source = 'api' or owner_id = $1)`];
  const args: any[] = [userId ?? null];
  const add = (sql: string, v: any) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)); };
  if (q) {
    const like = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like);
    where.push(`(lower(mpn) like $${args.length} or lower(name) like $${args.length})`);
  }
  if (params.category) add('lower(category) = ?', params.category.toLowerCase());
  if (params.manufacturer) add('lower(manufacturer) = ?', params.manufacturer.toLowerCase());
  if (params.source) add('source = ?', params.source);

  let rows = await many<ComponentRow>(ctx.db, `select * from components where ${where.join(' and ')} order by mpn, id`, args);
  for (const f of parseSpecFilters(params.spec)) {
    rows = rows.filter((c) => {
      const v = c.specs[f.key]?.value;
      if (typeof v !== 'number') return false;
      return f.op === 'gte' ? v >= f.value : f.op === 'lte' ? v <= f.value : Math.abs(v - f.value) < 1e-9;
    });
  }
  const total = rows.length;
  const page = rows.slice(params.offset, params.offset + params.limit);

  return {
    results: page.map(componentDto),
    total,
    provider: ctx.distributor.providerName,
    warnings,
    // US-03: tell the client to offer the Custom Part Creator.
    ...(total === 0 && q ? { not_found: true, message: 'Component not found', suggestion: 'create_custom_part' } : {}),
  };
}

// ---------- custom parts (US-08) ----------

const specInput = z.union([z.number(), z.string().min(1).max(60)]);

export const customPartBody = z.object({
  name: z.string().trim().min(1).max(120),
  mpn: z.string().trim().min(1).max(80).optional(),
  manufacturer: z.string().trim().max(80).default(''),
  category: z.string().trim().min(1).max(40).default('other'),
  description: z.string().max(500).default(''),
  package_type: z.string().trim().max(60).default(''),
  datasheet_url: z.string().url().or(z.literal('')).default(''),
  lifecycle_status: z.string().max(20).default('unknown'),
  stock: z.number().int().min(0).nullable().optional(),
  price: z.number().min(0).nullable().optional(),
  /** key -> number (canonical unit) or string like "3.3V" / "100mA" */
  specs: z.record(z.string(), specInput).default({}),
});

/** Parse user-entered spec values; a string must parse in the attribute's dimension or the request fails. */
export function specsFromInput(input: Record<string, number | string>): Specs {
  const out: Specs = {};
  for (const [key, v] of Object.entries(input)) {
    if (!SPEC_KEY_RE.test(key)) throw unprocessable('INVALID_SPEC_KEY', `"${key}" is not a valid spec key (lowercase letters, digits, underscore)`);
    const def = ATTRIBUTE_MAP.get(key);
    if (def?.type === 'string' || def?.group === 'item') throw unprocessable('INVALID_SPEC_KEY', `"${key}" is not a numeric spec`);
    if (typeof v === 'number') {
      out[key] = manualSpec(key, v);
      continue;
    }
    const parsed = parseQuantity(v, def?.dimension);
    if (parsed.value === null) throw unprocessable('UNPARSEABLE_SPEC', `Could not read "${v}" for ${key}: ${parsed.note ?? 'unknown format'}`);
    const spec: SpecValue = { raw: v, value: parsed.value, unit: parsed.unit, status: parsed.status, ...(parsed.note ? { note: parsed.note } : {}) };
    out[key] = spec;
  }
  return out;
}

export async function createCustomPart(q: Queryable, userId: string, input: z.infer<typeof customPartBody>) {
  const id = newId();
  const rows = await many<ComponentRow>(
    q,
    `insert into components (id, source, owner_id, mpn, manufacturer, name, category, description, package_type, datasheet_url, lifecycle_status, stock, price, specs)
     values ($1,'custom',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) returning *`,
    [id, userId, input.mpn ?? `CUSTOM-${id.slice(0, 8).toUpperCase()}`, input.manufacturer, input.name, input.category, input.description, input.package_type, input.datasheet_url, input.lifecycle_status, input.stock ?? null, input.price ?? null, json(specsFromInput(input.specs))],
  );
  return rows[0];
}

async function ownCustom(q: Queryable, id: string, userId: string) {
  const c = await getVisibleComponent(q, id, userId);
  if (c.source !== 'custom') {
    throw new HttpError(409, 'READ_ONLY_COMPONENT', 'Distributor parts are shared and read-only. Override a value on your BOM line instead.');
  }
  if (c.owner_id !== userId) throw forbidden();
  return c;
}

export async function updateCustomPart(q: Queryable, id: string, userId: string, input: Partial<z.infer<typeof customPartBody>>) {
  const c = await ownCustom(q, id, userId);
  const specs = input.specs ? { ...c.specs, ...specsFromInput(input.specs) } : c.specs;
  const rows = await many<ComponentRow>(
    q,
    `update components set name=$2, manufacturer=$3, category=$4, description=$5, package_type=$6, datasheet_url=$7,
       lifecycle_status=$8, stock=$9, price=$10, specs=$11::jsonb, mpn=$12, updated_at=now() where id=$1 returning *`,
    [id, input.name ?? c.name, input.manufacturer ?? c.manufacturer, input.category ?? c.category, input.description ?? c.description, input.package_type ?? c.package_type, input.datasheet_url ?? c.datasheet_url, input.lifecycle_status ?? c.lifecycle_status, input.stock === undefined ? c.stock : input.stock, input.price === undefined ? c.price : input.price, json(specs), input.mpn ?? c.mpn],
  );
  return rows[0];
}

/** Manual override of one parsed value on a custom part (US-06 on the Component Detail page). */
export async function setCustomSpec(q: Queryable, id: string, userId: string, key: string, value: number, unit?: string | null) {
  if (!SPEC_KEY_RE.test(key)) throw unprocessable('INVALID_SPEC_KEY', `"${key}" is not a valid spec key`);
  const c = await ownCustom(q, id, userId);
  const specs = { ...c.specs, [key]: manualSpec(key, value, unit) };
  const rows = await many<ComponentRow>(q, 'update components set specs=$2::jsonb, updated_at=now() where id=$1 returning *', [id, json(specs)]);
  return rows[0];
}

export async function deleteCustomPart(q: Queryable, id: string, userId: string) {
  await ownCustom(q, id, userId);
  const used = await one(q, 'select id from bom_items where component_id = $1 limit 1', [id]);
  if (used) throw new HttpError(409, 'COMPONENT_IN_USE', 'This part is used in a project BOM and cannot be deleted');
  await q.query('delete from components where id = $1', [id]);
}
