import type { Component, SpecValue } from '../index';

const UNIT_LABEL: Record<string, string> = { ohm: 'Ω', degC: '°C' };
const unit = (u: string | null) => (u ? (UNIT_LABEL[u] ?? u) : '');

const trim = (n: number) => String(Number(n.toPrecision(6)));

export function formatSpec(s: SpecValue | undefined): string {
  if (!s || s.value === null) return s?.raw ?? '';
  return `${trim(s.value)}${s.unit ? ` ${unit(s.unit)}` : ''}`;
}

const val = (c: Component, key: string) => c.specs[key]?.value ?? null;

function range(c: Component, lo: string, hi: string): string | null {
  const a = val(c, lo);
  const b = val(c, hi);
  if (a === null && b === null) return null;
  const u = unit(c.specs[hi]?.unit ?? c.specs[lo]?.unit ?? null);
  if (a !== null && b !== null) return a === b ? `${trim(a)} ${u}` : `${trim(a)} to ${trim(b)} ${u}`;
  return `${trim((a ?? b)!)} ${u}`;
}

export interface KeySpec {
  label: string;
  value: string;
}

/** The handful of numbers an engineer scans first. */
export function keySpecs(c: Component): KeySpec[] {
  const out: KeySpec[] = [];
  const add = (label: string, value: string | null) => value && out.push({ label, value });
  add('Supply', range(c, 'voltage_min', 'voltage_max'));
  add('Output', val(c, 'output_voltage') !== null ? formatSpec(c.specs.output_voltage) : null);
  add('Draw', val(c, 'current_max') !== null ? formatSpec(c.specs.current_max) : null);
  add('Max output', val(c, 'output_current_max') !== null ? formatSpec(c.specs.output_current_max) : null);
  const dims = ['length_mm', 'width_mm', 'height_mm'].map((k) => val(c, k)).filter((v): v is number => v !== null);
  add('Size', dims.length ? `${dims.map(trim).join(' x ')} mm` : null);
  return out;
}

const LABELS: Record<string, string> = {
  voltage_min: 'Supply voltage (min)',
  voltage_max: 'Supply voltage (max)',
  output_voltage: 'Output voltage',
  current_max: 'Current draw (max)',
  output_current_max: 'Output current (max)',
  power_max: 'Power (max)',
  logic_voltage: 'Logic level',
  frequency: 'Frequency',
  temp_min_c: 'Operating temp (min)',
  temp_max_c: 'Operating temp (max)',
  length_mm: 'Length',
  width_mm: 'Width',
  height_mm: 'Height',
};

export const specLabel = (key: string) => LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const CATEGORY_LABEL: Record<string, string> = {
  mcu: 'Microcontroller',
  power: 'Power',
  sensor: 'Sensor',
  display: 'Display',
  actuator: 'Actuator',
  ic: 'IC',
  passive: 'Passive',
  connector: 'Connector',
  pcb: 'PCB',
  enclosure: 'Enclosure',
};

/** Matches emoji and pictographs (but not the plain text marks (c) (R) TM); used by a test to keep the UI text-only. */
export const EMOJI_RE = /(?![©®™])[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}☀-➿]/u;
