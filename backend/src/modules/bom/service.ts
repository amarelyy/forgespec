import { z } from 'zod';
import { AppContext } from '../../context';
import { Queryable, json, many, one } from '../../db/pool';
import { HttpError, notFound, unprocessable } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { SPEC_KEY_RE } from '../components/attributes';
import { ComponentRow, getVisibleComponent, supplyRisk } from '../components/service';
import { Specs, manualSpec } from '../components/specs';
import { audit } from '../audit/service';
import { notify, projectMemberIds } from '../notifications/service';
import { Evaluation, evaluateProject } from '../rules/service';
import { BomRow, loadBomRows, unitPrice } from './rows';

// ---------- notifications after a change (outside the DB transaction, best-effort) ----------

/** Tell the team the BOM changed and flag newly introduced critical errors (US-15). */
export async function notifyAfterEvaluation(ctx: AppContext, projectId: string, actorId: string, evaluation: Evaluation, what: string, bomChanged = true) {
  try {
    const project = await one<{ name: string }>(ctx.db, 'select name from projects where id = $1', [projectId]);
    const name = project?.name ?? 'project';
    if (bomChanged) {
      const others = await projectMemberIds(ctx.db, projectId, actorId);
      await notify(ctx, { userIds: others, projectId, type: 'bom_updated', title: `BOM updated in ${name}`, body: what });
    }
    if (evaluation.newErrors.length) {
      const all = await projectMemberIds(ctx.db, projectId);
      await notify(ctx, {
        userIds: all,
        projectId,
        type: 'critical_error',
        title: `${evaluation.newErrors.length} new compatibility error(s) in ${name}`,
        body: evaluation.newErrors.slice(0, 3).map((e) => e.message).join('\n'),
      });
    }
  } catch (e) {
    console.error('[notifyAfterEvaluation]', (e as Error).message);
  }
}

// ---------- DTO ----------

export interface ItemIssue {
  rule_id: string;
  rule_name: string;
  severity: string;
  message: string;
  attributes: string[];
  item_ids: string[];
}

export async function listItems(q: Queryable, projectId: string, opts: { includeRemoved?: boolean } = {}) {
  const [rows, failures] = await Promise.all([
    loadBomRows(q, projectId, opts.includeRemoved ? undefined : ['active', 'deprecated']),
    many<any>(q, `select * from evaluation_results where project_id = $1 and status = 'failed'`, [projectId]),
  ]);
  const issuesByItem = new Map<string, ItemIssue[]>();
  for (const f of failures) {
    const issue: ItemIssue = { rule_id: f.rule_id, rule_name: f.rule_name, severity: f.severity, message: f.message, attributes: f.attributes ?? [], item_ids: f.item_ids ?? [] };
    for (const id of f.item_ids ?? []) issuesByItem.set(id, [...(issuesByItem.get(id) ?? []), issue]);
  }
  return rows.map((r) => itemDto(r, issuesByItem.get(r.id) ?? []));
}

export function itemDto(r: BomRow, issues: ItemIssue[] = []) {
  const price = unitPrice(r);
  const specs: Record<string, Specs[string] & { overridden: boolean }> = {};
  for (const [k, v] of Object.entries(r.component_specs)) specs[k] = { ...v, overridden: false };
  for (const [k, v] of Object.entries(r.spec_overrides)) specs[k] = { ...v, overridden: true };
  const worst = issues.some((i) => i.severity === 'error') ? 'error' : issues.length ? 'warning' : 'ok';
  return {
    id: r.id,
    project_id: r.project_id,
    component_id: r.component_id,
    quantity: r.quantity,
    unit_price: price,
    unit_price_override: r.unit_price,
    line_total: price === null ? null : Math.round(price * r.quantity * 1e6) / 1e6,
    supplier_url: r.supplier_url,
    designator: r.designator,
    rail: r.rail,
    notes: r.notes,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    component: {
      id: r.component_id, mpn: r.mpn, manufacturer: r.manufacturer, name: r.name, category: r.category, package_type: r.package_type,
      datasheet_url: r.datasheet_url, lifecycle_status: r.lifecycle_status, stock: r.stock, source: r.source,
      supply_risk: supplyRisk({ lifecycle_status: r.lifecycle_status, stock: r.stock }),
    },
    specs,
    compatibility: { status: worst, issues },
  };
}

// ---------- mutations ----------

export const itemFields = {
  quantity: z.number().int().min(1).max(1_000_000),
  unit_price: z.number().min(0).nullable(),
  supplier_url: z.string().max(500).refine((v) => v === '' || /^https?:\/\//i.test(v), 'must be an http(s) URL'),
  designator: z.string().max(40),
  rail: z.string().max(40),
  notes: z.string().max(1000),
  status: z.enum(['active', 'deprecated', 'removed']),
};

export const addItemBody = z
  .object({
    component_id: z.string().optional(),
    mpn: z.string().trim().min(1).max(80).optional(),
    quantity: itemFields.quantity.default(1),
    unit_price: itemFields.unit_price.optional(),
    supplier_url: itemFields.supplier_url.default(''),
    designator: itemFields.designator.default(''),
    rail: itemFields.rail.default(''),
    notes: itemFields.notes.default(''),
  })
  .refine((b) => !!b.component_id !== !!b.mpn, { message: 'provide exactly one of component_id or mpn' });

export const patchItemBody = z.object(itemFields).partial().refine((b) => Object.keys(b).length > 0, 'nothing to update');

export const bulkBody = z.object({
  item_ids: z.array(z.string()).min(1).max(500),
  patch: z.object({ ...itemFields }).omit({ designator: true }).partial().refine((b) => Object.keys(b).length > 0, 'nothing to update'),
});

async function resolveComponent(ctx: AppContext, userId: string, input: { component_id?: string; mpn?: string }): Promise<ComponentRow> {
  if (input.component_id) return getVisibleComponent(ctx.db, input.component_id, userId);
  const mpn = input.mpn!.trim();
  const local = await one<ComponentRow>(
    ctx.db,
    `select * from components where lower(mpn) = $1 and (source = 'api' or owner_id = $2) order by source desc limit 1`,
    [mpn.toLowerCase(), userId],
  );
  if (local) return local;
  const found = await ctx.distributor.findByMpn(mpn);
  if (!found) {
    throw new HttpError(404, 'COMPONENT_NOT_FOUND', 'Component not found', { suggestion: 'create_custom_part', mpn });
  }
  return found;
}

export async function addItem(ctx: AppContext, userId: string, projectId: string, input: z.infer<typeof addItemBody>) {
  const component = await resolveComponent(ctx, userId, input);
  const out = await ctx.db.tx(async (q) => {
    const id = newId();
    await q.query(
      `insert into bom_items (id, project_id, component_id, quantity, unit_price, supplier_url, designator, rail, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, projectId, component.id, input.quantity, input.unit_price ?? null, input.supplier_url, input.designator, input.rail, input.notes],
    );
    await touch(q, projectId);
    await audit(q, { projectId, userId, action: 'bom.add', entity: 'bom_item', entityId: id, detail: { mpn: component.mpn, quantity: input.quantity } });
    return { id, evaluation: await evaluateProject(q, projectId) };
  });
  await notifyAfterEvaluation(ctx, projectId, userId, out.evaluation, `Added ${component.mpn} (x${input.quantity})`);
  return { id: out.id, evaluation: out.evaluation };
}

const touch = (q: Queryable, projectId: string) => q.query('update projects set updated_at = now() where id = $1', [projectId]);

async function assertItems(q: Queryable, projectId: string, ids: string[]) {
  const rows = await many<{ id: string }>(q, 'select id from bom_items where project_id = $1', [projectId]);
  const have = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length) throw new HttpError(404, 'ITEM_NOT_FOUND', 'BOM item not found in this project', { missing });
}

function buildUpdate(patch: Record<string, unknown>, startAt: number) {
  const cols = Object.keys(patch);
  return { sql: cols.map((c, i) => `${c} = $${i + startAt}`).join(', '), values: cols.map((c) => patch[c]) };
}

export async function updateItems(ctx: AppContext, userId: string, projectId: string, ids: string[], patch: Record<string, unknown>, action: string) {
  const out = await ctx.db.tx(async (q) => {
    await assertItems(q, projectId, ids);
    const { sql, values } = buildUpdate(patch, 3);
    for (const id of ids) {
      await q.query(`update bom_items set ${sql}, updated_at = now() where id = $1 and project_id = $2`, [id, projectId, ...values]);
      await audit(q, { projectId, userId, action, entity: 'bom_item', entityId: id, detail: patch });
    }
    await touch(q, projectId);
    return evaluateProject(q, projectId);
  });
  await notifyAfterEvaluation(ctx, projectId, userId, out, ids.length === 1 ? 'A component was edited' : `${ids.length} components were edited`);
  return out;
}

export async function removeItem(ctx: AppContext, userId: string, projectId: string, itemId: string, hard: boolean) {
  const out = await ctx.db.tx(async (q) => {
    await assertItems(q, projectId, [itemId]);
    if (hard) await q.query('delete from bom_items where id = $1 and project_id = $2', [itemId, projectId]);
    else await q.query(`update bom_items set status = 'removed', updated_at = now() where id = $1 and project_id = $2`, [itemId, projectId]);
    await touch(q, projectId);
    await audit(q, { projectId, userId, action: hard ? 'bom.delete' : 'bom.remove', entity: 'bom_item', entityId: itemId });
    return evaluateProject(q, projectId);
  });
  await notifyAfterEvaluation(ctx, projectId, userId, out, 'A component was removed');
  return out;
}

/** US-06: override one auto-parsed value on this BOM line, then re-evaluate affected rules. */
export async function setOverride(ctx: AppContext, userId: string, projectId: string, itemId: string, key: string, value: number, unit?: string | null) {
  if (!SPEC_KEY_RE.test(key)) throw unprocessable('INVALID_SPEC_KEY', `"${key}" is not a valid spec key`);
  const out = await ctx.db.tx(async (q) => {
    await assertItems(q, projectId, [itemId]);
    const row = await one<{ spec_overrides: Specs }>(q, 'select spec_overrides from bom_items where id = $1', [itemId]);
    const next = { ...row!.spec_overrides, [key]: manualSpec(key, value, unit) };
    await q.query('update bom_items set spec_overrides = $2::jsonb, updated_at = now() where id = $1', [itemId, json(next)]);
    await touch(q, projectId);
    await audit(q, { projectId, userId, action: 'bom.override', entity: 'bom_item', entityId: itemId, detail: { key, value, unit: unit ?? null } });
    return evaluateProject(q, projectId);
  });
  await notifyAfterEvaluation(ctx, projectId, userId, out, `Spec ${key} overridden`);
  return out;
}

export async function clearOverride(ctx: AppContext, userId: string, projectId: string, itemId: string, key: string) {
  const out = await ctx.db.tx(async (q) => {
    await assertItems(q, projectId, [itemId]);
    const row = await one<{ spec_overrides: Specs }>(q, 'select spec_overrides from bom_items where id = $1', [itemId]);
    if (!row!.spec_overrides[key]) throw notFound('Override', 'OVERRIDE_NOT_FOUND');
    const next = { ...row!.spec_overrides };
    delete next[key];
    await q.query('update bom_items set spec_overrides = $2::jsonb, updated_at = now() where id = $1', [itemId, json(next)]);
    await audit(q, { projectId, userId, action: 'bom.override_clear', entity: 'bom_item', entityId: itemId, detail: { key } });
    return evaluateProject(q, projectId);
  });
  await notifyAfterEvaluation(ctx, projectId, userId, out, `Spec ${key} override cleared`);
  return out;
}

/** After a custom part's specs change, refresh the report of every project that uses it. */
export async function reevaluateProjectsUsing(ctx: AppContext, componentId: string) {
  const rows = await many<{ project_id: string }>(ctx.db, 'select distinct project_id from bom_items where component_id = $1', [componentId]);
  for (const { project_id } of rows) await ctx.db.tx((q) => evaluateProject(q, project_id));
}
