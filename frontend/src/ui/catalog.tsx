import type { ReactNode } from 'react';

/** Sample parts for the hero drawer. Shown as-is when the visitor has not typed anything and as the offline fallback. */

const MULT: Record<string, number> = { p: 1e-12, n: 1e-9, µ: 1e-6, u: 1e-6, m: 1e-3, k: 1e3, M: 1e6 };

/** Reads every number with this unit out of a datasheet string: "1.8V ~ 5.5V" -> [1.8, 5.5]. */
export function parseUnits(str: string, unit: string): number[] {
  const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*([pnµumkM])?${unit}`, 'g');
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) out.push(parseFloat(m[1]) * (m[2] ? MULT[m[2]] : 1));
  return out;
}

const fmtV = (r: number[]) => (r.length > 1 ? `${r[0]} – ${r[r.length - 1]} V` : `${r[0]} V`);
const fmtA = (a: number) => (a >= 1 ? `${a.toFixed(2)} A` : a >= 1e-3 ? `${+(a * 1e3).toFixed(1)} mA` : `${+(a * 1e6).toFixed(1)} µA`);

export interface SpecRow {
  key: string;
  raw: string;
  /** Empty when the row is plain text rather than a parsed number. */
  value: string;
  quoted: boolean;
}

export interface SamplePart {
  mpn: string;
  d: string;
  ic: IconKey;
  v?: string;
  i?: string;
  rating?: string;
  p: number;
  pkg: string;
  kw: string;
  ilbl?: string;
}

export function sampleRows(p: SamplePart): SpecRow[] {
  const rows: SpecRow[] = [];
  if (p.v) rows.push({ key: 'Supply', raw: p.v, value: fmtV(parseUnits(p.v, 'V')), quoted: true });
  if (p.rating) {
    const u = p.rating.endsWith('W') ? 'W' : 'V';
    rows.push({ key: 'Rated', raw: p.rating, value: `${parseUnits(p.rating, u)[0]} ${u}`, quoted: true });
  }
  if (p.i) rows.push({ key: p.ilbl ?? 'Draw', raw: p.i, value: fmtA(parseUnits(p.i, 'A')[0]), quoted: true });
  rows.push({ key: 'Package', raw: p.pkg, value: '', quoted: false });
  rows.push({ key: 'Price', raw: 'unit, qty 1', value: `$${p.p.toFixed(2)}`, quoted: false });
  return rows;
}

export const CATALOG: [string, SamplePart[]][] = [
  ['Microcontrollers', [
    { mpn: 'ATMEGA328P-AU', d: '8-bit AVR microcontroller', ic: 'mcu', v: '1.8V ~ 5.5V', i: '12mA', p: 2.89, pkg: 'TQFP-32', kw: 'arduino avr' },
    { mpn: 'ESP32-WROOM-32E', d: 'Wi-Fi and Bluetooth module', ic: 'module', v: '3.0V ~ 3.6V', i: '240mA', p: 3.1, pkg: 'SMD module', kw: 'wifi bluetooth espressif' },
    { mpn: 'STM32F407VGT6', d: 'Cortex-M4 microcontroller, 168 MHz', ic: 'mcu', v: '1.8V ~ 3.6V', i: '90mA', p: 11.2, pkg: 'LQFP-100', kw: 'stm32 arm' },
    { mpn: 'RP2040', d: 'Dual-core Cortex-M0+', ic: 'mcu', v: '1.62V ~ 3.63V', i: '25mA', p: 0.8, pkg: 'QFN-56', kw: 'pico raspberry' },
  ]],
  ['Power', [
    { mpn: 'LM7805CT', d: '5 V linear regulator', ic: 'reg', v: '7V ~ 35V', i: '1.5A', p: 0.62, pkg: 'TO-220', kw: 'regulator 5v', ilbl: 'Output' },
    { mpn: 'AMS1117-3.3', d: '3.3 V low-dropout regulator', ic: 'reg', v: '4.75V ~ 15V', i: '1A', p: 0.18, pkg: 'SOT-223', kw: 'ldo regulator 3.3v', ilbl: 'Output' },
  ]],
  ['Sensors', [
    { mpn: 'BME280', d: 'Temperature, humidity and pressure sensor', ic: 'sensor', v: '1.71V ~ 3.6V', i: '3.6µA', p: 4.75, pkg: 'LGA-8', kw: 'temperature humidity bosch weather' },
    { mpn: 'MPU-6050', d: 'Accelerometer and gyroscope', ic: 'sensor', v: '2.375V ~ 3.46V', i: '3.9mA', p: 2.1, pkg: 'QFN-24', kw: 'imu gyro accelerometer tilt' },
    { mpn: 'HC-SR04', d: 'Ultrasonic distance module', ic: 'sonar', v: '5V', i: '15mA', p: 1.95, pkg: 'Module, 4-pin', kw: 'distance ultrasonic sonar' },
  ]],
  ['Motors', [
    { mpn: 'MG996R', d: 'Metal-gear servo', ic: 'servo', v: '4.8V ~ 7.2V', i: '2.5A', p: 6.4, pkg: 'Servo, 3-wire', kw: 'servo motor', ilbl: 'Stall' },
    { mpn: 'DRV8833PWPR', d: 'Dual H-bridge motor driver', ic: 'driver', v: '2.7V ~ 10.8V', i: '1.5A', p: 1.85, pkg: 'HTSSOP-16', kw: 'motor driver h-bridge', ilbl: 'Output' },
  ]],
  ['Passives', [
    { mpn: 'RC0603FR-0710KL', d: '10 kΩ resistor', ic: 'res', rating: '0.1W', p: 0.01, pkg: '0603', kw: 'resistor 10k' },
    { mpn: 'CL10B104KB8NNNC', d: '100 nF ceramic capacitor', ic: 'cap', rating: '50V', p: 0.02, pkg: '0603', kw: 'capacitor decoupling 100nf' },
  ]],
  ['Connectors', [
    { mpn: 'B2B-XH-A', d: 'JST XH 2-pin header', ic: 'conn', i: '3A', p: 0.11, pkg: 'Through-hole', kw: 'jst battery connector', ilbl: 'Rated' },
  ]],
];

export const CATEGORIES = ['All', ...CATALOG.map(([c]) => c)];

/* ---------- little part pictures ---------- */
const pins = (n: number, y: number) =>
  Array.from({ length: n }, (_, i) => <rect key={i} x={8 + i * (24 / (n - 1 || 1)) - 1} y={y} width="2" height="5" fill="#9aa5b0" />);

export type IconKey = 'mcu' | 'module' | 'reg' | 'sensor' | 'sonar' | 'servo' | 'driver' | 'res' | 'cap' | 'conn';

const range5 = [0, 1, 2, 3, 4];
const ICONS: Record<IconKey, ReactNode> = {
  mcu: (
    <>
      <rect x="8" y="8" width="24" height="24" rx="2" fill="#1d232b" />
      {range5.map((i) => (
        <g key={i} fill="#9aa5b0">
          <rect x={10 + i * 5} y="4" width="2" height="4" />
          <rect x={10 + i * 5} y="32" width="2" height="4" />
          <rect x="4" y={10 + i * 5} width="4" height="2" />
          <rect x="32" y={10 + i * 5} width="4" height="2" />
        </g>
      ))}
      <circle cx="13" cy="13" r="1.6" fill="#59636e" />
    </>
  ),
  module: (
    <>
      <rect x="6" y="5" width="28" height="22" rx="1.5" fill="#1f5fb0" />
      <rect x="14" y="10" width="12" height="12" fill="#c7ced5" />
      {pins(5, 27)}
    </>
  ),
  reg: (
    <>
      <rect x="10" y="4" width="20" height="8" rx="1" fill="#9aa5b0" />
      <circle cx="20" cy="8" r="2" fill="#5c6670" />
      <rect x="10" y="12" width="20" height="14" rx="1" fill="#1d232b" />
      <rect x="13" y="26" width="2" height="10" fill="#9aa5b0" />
      <rect x="19" y="26" width="2" height="10" fill="#9aa5b0" />
      <rect x="25" y="26" width="2" height="10" fill="#9aa5b0" />
    </>
  ),
  sensor: (
    <>
      <rect x="5" y="6" width="30" height="22" rx="2" fill="#6a3fb0" />
      <rect x="15" y="12" width="10" height="10" rx="1" fill="#e9edf1" />
      <circle cx="9" cy="10" r="1.6" fill="#e9edf1" />
      <circle cx="31" cy="10" r="1.6" fill="#e9edf1" />
      {pins(4, 28)}
    </>
  ),
  sonar: (
    <>
      <rect x="1" y="9" width="38" height="20" rx="2" fill="#1f5fb0" />
      <circle cx="10" cy="19" r="7.5" fill="#cfd6dc" />
      <circle cx="10" cy="19" r="4.5" fill="#3a434c" />
      <circle cx="30" cy="19" r="7.5" fill="#cfd6dc" />
      <circle cx="30" cy="19" r="4.5" fill="#3a434c" />
    </>
  ),
  servo: (
    <>
      <rect x="4" y="14" width="30" height="14" rx="1.5" fill="#1d232b" />
      <rect x="1" y="18" width="36" height="6" rx="1" fill="#1d232b" />
      <circle cx="12" cy="21" r="5" fill="#e9edf1" />
      <rect x="10" y="6" width="4" height="15" rx="2" fill="#e9edf1" />
    </>
  ),
  driver: (
    <>
      <rect x="6" y="10" width="28" height="20" rx="1.5" fill="#1d232b" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i} fill="#9aa5b0">
          <rect x={8 + i * 4.6} y="6" width="2" height="4" />
          <rect x={8 + i * 4.6} y="30" width="2" height="4" />
        </g>
      ))}
    </>
  ),
  res: (
    <g transform="rotate(-30 20 20)">
      <line x1="2" y1="20" x2="38" y2="20" stroke="#9aa5b0" strokeWidth="1.8" />
      <rect x="11" y="15" width="18" height="10" rx="4" fill="#d8b685" />
      <rect x="15" y="15" width="2" height="10" fill="#8a4b2b" />
      <rect x="19" y="15" width="2" height="10" fill="#1d232b" />
      <rect x="23" y="15" width="2" height="10" fill="#e07b1a" />
    </g>
  ),
  cap: (
    <>
      <rect x="10" y="13" width="20" height="14" rx="2" fill="#b98a52" />
      <rect x="6" y="13" width="5" height="14" fill="#c7ced5" />
      <rect x="29" y="13" width="5" height="14" fill="#c7ced5" />
    </>
  ),
  conn: (
    <>
      <rect x="7" y="10" width="26" height="20" rx="1.5" fill="#f1f3f5" stroke="#9aa5b0" />
      <rect x="13" y="15" width="4" height="8" fill="#c79a2b" />
      <rect x="23" y="15" width="4" height="8" fill="#c79a2b" />
    </>
  ),
};

export function PartPicture({ kind }: { kind: IconKey }) {
  return (
    <svg className="part" viewBox="0 0 40 40" aria-hidden="true">
      {ICONS[kind]}
    </svg>
  );
}

/** Maps a backend category onto one of the pictures above. */
export const CATEGORY_PICTURE: Record<string, IconKey> = {
  mcu: 'mcu', power: 'reg', sensor: 'sensor', actuator: 'servo', ic: 'driver', passive: 'res', connector: 'conn', display: 'module',
};
