import type { BomItem, BomSpecValue } from '../index';

/** Board geometry in canvas units. */
export const CARD_W = 196;
export const GAP = 36;
export const RAIL_H = 34;
const LABEL_W = 130;
const LANE_H = 220;
const PART_DROP = 84;

export interface Point {
  x: number;
  y: number;
}

export interface Lane {
  rail: string;
  x: number;
  y: number;
  width: number;
  parts: { item: BomItem; position: Point }[];
}

export const railLabel = (rail: string) => rail || 'Default rail';

/** Named rails first (highest name on top), the default rail last. */
export function railNames(items: BomItem[], extra: string[] = []): string[] {
  const names = [...new Set([...items.map((i) => i.rail), ...extra])];
  return names.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a, undefined, { numeric: true })));
}

/** One lane per rail, parts hanging under it. `saved` holds positions the user dragged to. */
export function layoutBoard(items: BomItem[], extra: string[] = [], saved: Record<string, Point> = {}): Lane[] {
  const lanes = railNames(items, extra).map((rail) => ({ rail, mine: items.filter((i) => i.rail === rail) }));
  const columns = Math.max(3, ...lanes.map((l) => l.mine.length));
  const width = LABEL_W + columns * (CARD_W + GAP);
  return lanes.map(({ rail, mine }, row) => ({
    rail,
    x: 0,
    y: row * LANE_H,
    width,
    parts: mine.map((item, col) => ({
      item,
      position: saved[item.id] ?? { x: LABEL_W + col * (CARD_W + GAP), y: row * LANE_H + PART_DROP },
    })),
  }));
}

const show = (s: BomSpecValue | undefined) => (s && s.value !== null ? Number(s.value.toPrecision(4)) : null);

/** The one or two numbers shown on a part card. */
export function cardSpecs(item: BomItem): string[] {
  const s = item.specs;
  const out: string[] = [];
  const output = show(s.output_voltage);
  const lo = show(s.voltage_min);
  const hi = show(s.voltage_max);
  if (output !== null) out.push(`Out ${output} V`);
  else if (lo !== null || hi !== null) out.push(lo !== null && hi !== null && lo !== hi ? `${lo} to ${hi} V` : `${hi ?? lo} V`);
  const draw = show(s.current_max);
  const give = show(s.output_current_max);
  if (give !== null) out.push(`Max ${give} A`);
  else if (draw !== null) out.push(`Draw ${draw} A`);
  return out;
}

/** Real spec entries only (the in-memory dev database can return empty overrides as stray text). */
export const specEntries = (item: BomItem) => Object.entries(item.specs).filter(([, s]) => 'value' in s);

/** The server message without the repeated rule name and the formula source: easier to read in the panel. */
export function issueText(message: string, ruleName: string): string {
  const text = message.startsWith(`${ruleName}: `) ? message.slice(ruleName.length + 2) : message;
  if (!text.endsWith(')')) return text;
  let depth = 0;
  for (let i = text.length - 1; i > 0; i--) {
    if (text[i] === ')') depth++;
    else if (text[i] === '(' && --depth === 0) return /\b[ab]\./.test(text.slice(i)) ? text.slice(0, i).trimEnd() : text;
  }
  return text;
}

/** Next free U1, U2, ... designator. */
export function nextDesignator(items: BomItem[]): string {
  const used = new Set(items.map((i) => i.designator));
  let n = 1;
  while (used.has(`U${n}`)) n++;
  return `U${n}`;
}
