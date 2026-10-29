import { ParseStatus, parseDimensions, parseQuantity, parseRange, Dimension, CANONICAL_UNIT } from './units';
import { ATTRIBUTE_MAP, SPEC_KEY_RE } from './attributes';

/** One parsed specification field: raw string + numeric value (US-06). */
export interface SpecValue {
  raw: string;
  value: number | null;
  unit: string | null;
  status: ParseStatus | 'manual';
  note?: string;
}
export type Specs = Record<string, SpecValue>;

type Handler = (raw: string, out: Specs) => void;

const put = (out: Specs, key: string, raw: string, value: number | null, unit: string | null, status: SpecValue['status'], note?: string) => {
  out[key] = { raw, value, unit, status, ...(note ? { note } : {}) };
};

const rangeTo = (minKey: string | null, maxKey: string | null, dim: Dimension): Handler => (raw, out) => {
  const r = parseRange(raw, dim);
  const unit = r.unit ?? CANONICAL_UNIT[dim];
  if (minKey) put(out, minKey, raw, r.min, unit, r.status, r.note);
  if (maxKey) put(out, maxKey, raw, r.max, unit, r.status, r.note);
};

const single = (key: string, dim: Dimension, pick: 'min' | 'max' = 'max'): Handler => (raw, out) => {
  const r = parseRange(raw, dim);
  put(out, key, raw, pick === 'max' ? r.max : r.min, r.unit ?? CANONICAL_UNIT[dim], r.status, r.note);
};

const dimensions: Handler = (raw, out) => {
  const d = parseDimensions(raw);
  const keys = ['length_mm', 'width_mm', 'height_mm'];
  if (d.status === 'failed') {
    keys.slice(0, 2).forEach((k) => put(out, k, raw, null, 'mm', 'failed', d.note));
    return;
  }
  const sorted = d.values.length === 3 ? [...d.values.slice(0, 2).sort((x, y) => y - x), d.values[2]] : [...d.values].sort((x, y) => y - x);
  sorted.forEach((v, i) => put(out, keys[i], raw, v, 'mm', d.status, d.note));
};

/** Distributor spec names (lower-cased, matched in order) -> our attribute keys. */
const ALIASES: [RegExp, Handler][] = [
  [/^(supply voltage|operating supply voltage|voltage - supply|operating voltage|input voltage|supply voltage range)/, rangeTo('voltage_min', 'voltage_max', 'voltage')],
  [/^(output voltage|voltage - output)/, single('output_voltage', 'voltage')],
  [/^(logic (level )?voltage|i\/o voltage)/, single('logic_voltage', 'voltage')],
  [/^(output current|current - output|max(imum)? output current)/, single('output_current_max', 'current')],
  [/^(supply current|current - supply|current consumption|operating current|current draw)/, single('current_max', 'current')],
  [/^(power|power dissipation|power rating)/, single('power_max', 'power')],
  [/^(operating temperature|temperature range)/, rangeTo('temp_min_c', 'temp_max_c', 'temperature')],
  [/^(frequency|clock speed|clock frequency)/, single('frequency', 'frequency')],
  [/^(size|dimensions?|size \/ dimension)/, dimensions],
  [/^length/, single('length_mm', 'length')],
  [/^width/, single('width_mm', 'length')],
  [/^height/, single('height_mm', 'length')],
];

/** Turn raw `name -> display string` pairs from a distributor into parsed numeric specs. */
export function buildSpecs(raw: Record<string, string>): Specs {
  const out: Specs = {};
  for (const [name, value] of Object.entries(raw)) {
    const lower = name.trim().toLowerCase();
    const alias = ALIASES.find(([re]) => re.test(lower));
    if (alias) {
      alias[1](value, out);
      continue;
    }
    const key = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
    if (!SPEC_KEY_RE.test(key) || ATTRIBUTE_MAP.has(key)) continue;
    const q = parseQuantity(value);
    put(out, key, value, q.value, q.unit, q.status, q.note);
  }
  return out;
}

/** Specs a user typed in the Custom Part Creator: numbers with the attribute's canonical unit. */
export function specsFromNumbers(values: Record<string, number>): Specs {
  const out: Specs = {};
  for (const [key, value] of Object.entries(values)) {
    const def = ATTRIBUTE_MAP.get(key);
    out[key] = { raw: def?.unit ? `${value} ${def.unit}` : String(value), value, unit: def?.unit ?? null, status: 'manual' };
  }
  return out;
}

/** Numeric value per key after BOM-level overrides are applied. Unparsed (null) fields are absent. */
export function effectiveSpecs(specs: Specs, overrides: Specs = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries({ ...specs, ...overrides })) if (typeof v.value === 'number') out[k] = v.value;
  return out;
}

export function manualSpec(key: string, value: number, unit?: string | null): SpecValue {
  const u = unit ?? ATTRIBUTE_MAP.get(key)?.unit ?? null;
  return { raw: u ? `${value} ${u}` : String(value), value, unit: u, status: 'manual' };
}
