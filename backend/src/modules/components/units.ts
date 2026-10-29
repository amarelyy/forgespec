/**
 * String-to-Numeric Unit Parser (feature: "String-to-Numeric Unit Parser", US-06).
 * "5.5V" -> 5.5 V, "100mA" -> 0.1 A, "20 x 30 mm" -> [20, 30] mm.
 * Values are normalised to a canonical unit per dimension so rules compare like with like.
 */

export type Dimension = 'voltage' | 'current' | 'power' | 'resistance' | 'frequency' | 'capacitance' | 'length' | 'temperature' | 'time' | 'percent';

export const CANONICAL_UNIT: Record<Dimension, string> = {
  voltage: 'V',
  current: 'A',
  power: 'W',
  resistance: 'ohm',
  frequency: 'Hz',
  capacitance: 'F',
  length: 'mm',
  temperature: 'degC',
  time: 's',
  percent: '%',
};

const UNITS: Record<string, { dim: Dimension; factor: number }> = {
  V: { dim: 'voltage', factor: 1 },
  mV: { dim: 'voltage', factor: 1e-3 },
  kV: { dim: 'voltage', factor: 1e3 },
  uV: { dim: 'voltage', factor: 1e-6 },
  A: { dim: 'current', factor: 1 },
  mA: { dim: 'current', factor: 1e-3 },
  uA: { dim: 'current', factor: 1e-6 },
  nA: { dim: 'current', factor: 1e-9 },
  W: { dim: 'power', factor: 1 },
  mW: { dim: 'power', factor: 1e-3 },
  kW: { dim: 'power', factor: 1e3 },
  ohm: { dim: 'resistance', factor: 1 },
  kohm: { dim: 'resistance', factor: 1e3 },
  Mohm: { dim: 'resistance', factor: 1e6 },
  Hz: { dim: 'frequency', factor: 1 },
  kHz: { dim: 'frequency', factor: 1e3 },
  MHz: { dim: 'frequency', factor: 1e6 },
  GHz: { dim: 'frequency', factor: 1e9 },
  F: { dim: 'capacitance', factor: 1 },
  mF: { dim: 'capacitance', factor: 1e-3 },
  uF: { dim: 'capacitance', factor: 1e-6 },
  nF: { dim: 'capacitance', factor: 1e-9 },
  pF: { dim: 'capacitance', factor: 1e-12 },
  mm: { dim: 'length', factor: 1 },
  cm: { dim: 'length', factor: 10 },
  m: { dim: 'length', factor: 1000 },
  um: { dim: 'length', factor: 1e-3 },
  in: { dim: 'length', factor: 25.4 },
  mil: { dim: 'length', factor: 0.0254 },
  degC: { dim: 'temperature', factor: 1 },
  s: { dim: 'time', factor: 1 },
  ms: { dim: 'time', factor: 1e-3 },
  us: { dim: 'time', factor: 1e-6 },
  ns: { dim: 'time', factor: 1e-9 },
  '%': { dim: 'percent', factor: 1 },
};

/** Normalise unit spellings: micro sign, ohm sign, degree sign, case-insensitive where unambiguous. */
function canonicalUnitSymbol(symbol: string): string | null {
  const s = symbol
    .replace(/[µμ]/g, 'u')
    .replace(/[Ω]/g, 'ohm')
    .replace(/°\s*C/i, 'degC')
    .replace(/^ohms?$/i, 'ohm')
    .replace(/^volts?$/i, 'V')
    .replace(/^amps?$/i, 'A')
    .replace(/^watts?$/i, 'W')
    .trim();
  if (UNITS[s]) return s;
  if (/^degc$/i.test(s) || /^c$/i.test(s) && symbol.includes('°')) return 'degC';
  // Case-insensitive fallback, but never for m/M (milli vs mega) style prefixes.
  const lower = s.toLowerCase();
  const matches = Object.keys(UNITS).filter((k) => k.toLowerCase() === lower);
  if (matches.length === 1) return matches[0];
  if (lower === 'mohm' || lower === 'kohm') return lower === 'mohm' ? 'Mohm' : 'kohm';
  return null;
}

export type ParseStatus = 'ok' | 'ambiguous' | 'failed';

export interface ParsedQuantity {
  raw: string;
  value: number | null;
  unit: string | null;
  dimension: Dimension | null;
  status: ParseStatus;
  note?: string;
}

const NUM = String.raw`[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?`;
const SINGLE = new RegExp(String.raw`^\s*(${NUM})\s*([A-Za-zµμΩ°%][A-Za-zµμΩ°%]*)?\s*$`);
const RANGE_SPLIT = /\s*(?:~|\bto\b|\.\.\.?|–|—|\s-\s|(?<=[A-Za-z%µμΩ°\d])-(?=\d))\s*/i;

function toNumber(text: string): { value: number; commaDecimal: boolean } {
  const commaDecimal = text.includes(',');
  return { value: Number(text.replace(',', '.')), commaDecimal };
}

/** Parse a single quantity such as "100mA". `expected` constrains the dimension and fills a missing unit. */
export function parseQuantity(raw: string, expected?: Dimension): ParsedQuantity {
  const text = String(raw ?? '').trim();
  const base: ParsedQuantity = { raw: text, value: null, unit: null, dimension: null, status: 'failed' };
  if (!text) return { ...base, note: 'empty value' };

  const m = SINGLE.exec(text);
  if (!m) {
    if (RANGE_SPLIT.test(text) && /\d/.test(text)) {
      return { ...base, status: 'ambiguous', note: 'looks like a range; parse it as a range' };
    }
    return { ...base, note: 'not a number with a unit' };
  }
  const { value, commaDecimal } = toNumber(m[1]);
  if (!Number.isFinite(value)) return { ...base, note: 'not a finite number' };
  const symbolRaw = m[2];

  if (!symbolRaw) {
    return {
      raw: text,
      value,
      unit: expected ? CANONICAL_UNIT[expected] : null,
      dimension: expected ?? null,
      status: 'ambiguous',
      note: expected ? `no unit given, assumed ${CANONICAL_UNIT[expected]}` : 'no unit given',
    };
  }
  const symbol = canonicalUnitSymbol(symbolRaw);
  if (!symbol) return { ...base, note: `unknown unit "${symbolRaw}"` };
  const def = UNITS[symbol];
  if (expected && def.dim !== expected) {
    return { ...base, dimension: def.dim, note: `expected ${expected} but got ${def.dim}` };
  }
  return {
    raw: text,
    value: def.dim === 'temperature' || def.dim === 'percent' ? value : roundSig(value * def.factor),
    unit: CANONICAL_UNIT[def.dim],
    dimension: def.dim,
    status: commaDecimal ? 'ambiguous' : 'ok',
    note: commaDecimal ? 'comma read as decimal separator' : undefined,
  };
}

export interface ParsedRange {
  raw: string;
  min: number | null;
  max: number | null;
  unit: string | null;
  dimension: Dimension | null;
  status: ParseStatus;
  note?: string;
}

/** "1.8V ~ 5.5V", "1.8 to 5.5 V", "-40°C ~ 85°C". A single value yields min = max. */
export function parseRange(raw: string, expected?: Dimension): ParsedRange {
  const text = String(raw ?? '').trim();
  const fail = (note: string): ParsedRange => ({ raw: text, min: null, max: null, unit: null, dimension: null, status: 'failed', note });
  if (!text) return fail('empty value');

  const parts = text.split(RANGE_SPLIT).filter((p) => p !== '');
  if (parts.length === 1) {
    const q = parseQuantity(parts[0], expected);
    return { raw: text, min: q.value, max: q.value, unit: q.unit, dimension: q.dimension, status: q.status, note: q.note };
  }
  if (parts.length !== 2) return fail('could not split into min and max');

  // Allow the unit to be written once at the end: "1.8 ~ 5.5 V".
  const trailing = /([A-Za-zµμΩ°%]+(?:\s?C)?)\s*$/.exec(parts[1])?.[1];
  const first = /[A-Za-zµμΩ°%]/.test(parts[0]) ? parts[0] : trailing ? `${parts[0]}${trailing}` : parts[0];
  const lo = parseQuantity(first, expected);
  const hi = parseQuantity(parts[1], expected);
  if (lo.value === null || hi.value === null) return fail(lo.note ?? hi.note ?? 'could not parse range ends');
  if (lo.dimension !== hi.dimension) return fail('range ends use different units');
  const status: ParseStatus = lo.status === 'ok' && hi.status === 'ok' ? 'ok' : 'ambiguous';
  return {
    raw: text,
    min: Math.min(lo.value, hi.value),
    max: Math.max(lo.value, hi.value),
    unit: hi.unit,
    dimension: hi.dimension,
    status,
    note: lo.note ?? hi.note,
  };
}

/** "20 x 30 x 5 mm" -> [20, 30, 5] in mm. */
export function parseDimensions(raw: string): { values: number[]; status: ParseStatus; note?: string } {
  const text = String(raw ?? '').trim();
  const unitMatch = /([A-Za-z]+)\s*$/.exec(text);
  const body = unitMatch ? text.slice(0, unitMatch.index) : text;
  const nums = body.split(/\s*[x×*]\s*/i).map((p) => p.trim());
  if (nums.length < 2 || nums.length > 3 || nums.some((n) => !new RegExp(`^${NUM}$`).test(n))) {
    return { values: [], status: 'failed', note: 'expected "L x W [x H] unit"' };
  }
  const symbol = unitMatch ? canonicalUnitSymbol(unitMatch[1]) : null;
  const def = symbol ? UNITS[symbol] : undefined;
  if (def && def.dim !== 'length') return { values: [], status: 'failed', note: 'not a length unit' };
  const factor = def?.factor ?? 1;
  return {
    values: nums.map((n) => roundSig(toNumber(n).value * factor)),
    status: def ? 'ok' : 'ambiguous',
    note: def ? undefined : 'no unit given, assumed mm',
  };
}

/** Avoid float noise like 0.1 * 1000 style artefacts (100 * 1e-3 = 0.1 exactly enough). */
function roundSig(n: number): number {
  return Number(n.toPrecision(12));
}
