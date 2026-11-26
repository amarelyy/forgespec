import { describe, expect, it } from 'vitest';
import type { BomItem } from '../index';
import { cardSpecs, issueText, layoutBoard, nextDesignator, railNames, specEntries } from './layout';

const item = (id: string, rail: string, extra: Partial<BomItem> = {}) => ({ id, rail, designator: '', specs: {}, ...extra }) as BomItem;
const v = (value: number) => ({ raw: String(value), value, unit: 'V', status: 'ok' as const, overridden: false });

describe('board layout', () => {
  it('orders rails by name with the default rail last, including empty rails', () => {
    expect(railNames([item('a', ''), item('b', '3V3'), item('c', '12V')], ['5V'])).toEqual(['12V', '5V', '3V3', '']);
  });

  it('puts each part in the lane of its rail and honours a dragged position', () => {
    const lanes = layoutBoard([item('a', '5V'), item('b', '5V'), item('c', '')], [], { b: { x: 7, y: 9 } });
    expect(lanes.map((l) => l.parts.map((p) => p.item.id))).toEqual([['a', 'b'], ['c']]);
    expect(lanes[0].parts[1].position).toEqual({ x: 7, y: 9 });
    expect(lanes[1].parts[0].position.y).toBeGreaterThan(lanes[0].parts[0].position.y);
  });

  it('shows issue messages without the formula, and skips entries that are not specs', () => {
    expect(issueText('Voltage: U1 conflicts with U3 (between(a.output_voltage, b.voltage_min, b.voltage_max))', 'Voltage')).toBe('U1 conflicts with U3');
    expect(issueText('Too tall (12 mm)', 'Height')).toBe('Too tall (12 mm)');
    expect(specEntries(item('a', '', { specs: { '0': { '0': '{', overridden: true } as never, voltage_min: v(3) } })).map(([k]) => k)).toEqual(['voltage_min']);
  });

  it('summarises a part and suggests the next free designator', () => {
    expect(cardSpecs(item('a', '', { specs: { voltage_min: v(3), voltage_max: v(3.6) } }))).toEqual(['3 to 3.6 V']);
    expect(nextDesignator([item('a', '', { designator: 'U1' }), item('b', '', { designator: 'U3' })])).toBe('U2');
  });
});
