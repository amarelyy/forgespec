import { describe, expect, it } from 'vitest';
import { buildSpecs } from '../src/modules/components/specs';
import { parseDimensions, parseQuantity, parseRange } from '../src/modules/components/units';

describe('parseQuantity', () => {
  it('parses the PRD examples', () => {
    expect(parseQuantity('5.5V')).toMatchObject({ value: 5.5, unit: 'V', status: 'ok' });
    expect(parseQuantity('100mA')).toMatchObject({ value: 0.1, unit: 'A', status: 'ok' });
  });
  it('normalises prefixes and spellings', () => {
    expect(parseQuantity('3.3 V').value).toBe(3.3);
    expect(parseQuantity('1.5 A').value).toBe(1.5);
    expect(parseQuantity('500 mW')).toMatchObject({ value: 0.5, unit: 'W' });
    expect(parseQuantity('4.7 kΩ')).toMatchObject({ value: 4700, unit: 'ohm' });
    expect(parseQuantity('10µF')).toMatchObject({ value: 1e-5, unit: 'F' });
    expect(parseQuantity('2.54 mm')).toMatchObject({ value: 2.54, unit: 'mm' });
  });
  it('flags ambiguous input instead of guessing silently', () => {
    expect(parseQuantity('5.5', 'voltage')).toMatchObject({ value: 5.5, unit: 'V', status: 'ambiguous' });
    expect(parseQuantity('3,3V').status).toBe('ambiguous');
  });
  it('rejects a wrong dimension and garbage', () => {
    expect(parseQuantity('100mA', 'voltage')).toMatchObject({ value: null, status: 'failed' });
    expect(parseQuantity('abc')).toMatchObject({ value: null, status: 'failed' });
    expect(parseQuantity('5 flurbs').status).toBe('failed');
    expect(parseQuantity('')).toMatchObject({ value: null, status: 'failed' });
  });
  it('does not confuse milli and mega', () => {
    expect(parseQuantity('1 mV').value).toBe(1e-3);
    expect(parseQuantity('1 MHz').value).toBe(1e6);
  });
});

describe('parseRange', () => {
  it('parses distributor style ranges', () => {
    expect(parseRange('1.8V ~ 5.5V', 'voltage')).toMatchObject({ min: 1.8, max: 5.5, unit: 'V', status: 'ok' });
    expect(parseRange('3.0 to 3.6 V', 'voltage')).toMatchObject({ min: 3, max: 3.6 });
    expect(parseRange('-40°C ~ 85°C', 'temperature')).toMatchObject({ min: -40, max: 85 });
  });
  it('treats a single value as min = max', () => {
    expect(parseRange('5V', 'voltage')).toMatchObject({ min: 5, max: 5 });
  });
  it('fails on mixed dimensions', () => {
    expect(parseRange('1V ~ 5A').status).toBe('failed');
  });
});

describe('parseDimensions', () => {
  it('parses LxWxH with unit', () => {
    expect(parseDimensions('20 x 30 x 5 mm')).toMatchObject({ values: [20, 30, 5], status: 'ok' });
    expect(parseDimensions('2 x 3 cm').values).toEqual([20, 30]);
  });
  it('rejects non-dimension text', () => {
    expect(parseDimensions('big').status).toBe('failed');
  });
});

describe('buildSpecs', () => {
  it('maps distributor names onto rule attributes', () => {
    const s = buildSpecs({ 'Supply Voltage': '3.0V ~ 3.6V', 'Supply Current': '500mA', Size: '18 x 25.5 x 3.1 mm', 'Mounting Type': 'SMD' });
    expect(s.voltage_min.value).toBe(3);
    expect(s.voltage_max.value).toBe(3.6);
    expect(s.current_max.value).toBe(0.5);
    expect(s.length_mm.value).toBe(25.5);
    expect(s.width_mm.value).toBe(18);
    expect(s.height_mm.value).toBe(3.1);
    expect(s.mounting_type.value).toBeNull();
  });
});
