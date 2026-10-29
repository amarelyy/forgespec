import { describe, expect, it } from 'vitest';
import { RuleDef, RuleItem, runRules, validateRuleDef } from '../src/modules/rules/engine';
import { evaluateFormula, validateFormula } from '../src/modules/rules/expression';
import { PREBUILT_RULES } from '../src/modules/rules/prebuilt';
import { diffSnapshots, SnapshotItem } from '../src/modules/versions/diff';

const item = (id: string, props: Record<string, any>): RuleItem => ({ id, mpn: id, quantity: 1, rail: '', ...props });

describe('formula language', () => {
  it('evaluates arithmetic, comparison and logic', () => {
    expect(evaluateFormula('a.x * 2 + 1 == 7', { a: { x: 3 } })).toBe(true);
    expect(evaluateFormula('a.x > 1 and not (a.x > 5)', { a: { x: 3 } })).toBe(true);
    expect(evaluateFormula('a.name == "esp"', { a: { name: 'esp' } })).toBe(true);
    expect(evaluateFormula('between(a.v, 3, 3.6)', { a: { v: 3.3 } })).toBe(true);
  });
  it('is float tolerant', () => {
    expect(evaluateFormula('a.x + a.y == 0.3', { a: { x: 0.1, y: 0.2 } })).toBe(true);
  });
  it('rejects code injection and bad syntax', () => {
    expect(() => validateFormula('pair', 'process.exit(1)')).toThrow();
    expect(() => validateFormula('pair', 'a.x <= ')).toThrow();
    expect(() => validateFormula('pair', 'a.x + b.y')).toThrow(/true\/false/);
    expect(() => validateFormula('single', 'a.x <= b.y')).toThrow(/b\.\*/);
    expect(() => validateFormula('pair', 'sum(b.x) > 1')).toThrow(/aggregate/);
    expect(() => validateFormula('aggregate', 'b.x > 1')).toThrow(/inside/);
    expect(() => validateFormula('pair', 'a.constructor == 1')).not.toThrow(); // attribute lookup is data only
    expect(() => validateFormula('pair', 'x'.repeat(600))).toThrow(/longer/);
  });
  it('lets one side of "or" rescue a missing attribute', () => {
    expect(evaluateFormula('a.x > 1 or a.y > 1', { a: { y: 5 } })).toBe(true);
    expect(() => evaluateFormula('a.x > 1 or a.y > 1', { a: { y: 0 } })).toThrow();
  });
});

describe('prebuilt rules', () => {
  const mcu = item('mcu', { category: 'mcu', voltage_min: 3.0, voltage_max: 3.6, current_max: 0.5 });
  const sensor5 = item('sensor', { category: 'sensor', voltage_min: 4.5, voltage_max: 5.5, current_max: 0.015 });

  it('all prebuilt rules are valid', () => {
    for (const r of PREBUILT_RULES) expect(validateRuleDef(r), r.id).toEqual([]);
  });
  it('flags a 5V supply feeding a 3.3V-only MCU, not the matching sensor', () => {
    const psu = item('psu', { category: 'power', output_voltage: 5, output_current_max: 1.5 });
    const res = runRules([psu, mcu, sensor5], PREBUILT_RULES);
    const failed = res.filter((r) => r.status === 'failed');
    expect(failed.map((f) => f.rule_id)).toContain('prebuilt-supply-voltage-range');
    const v = failed.filter((f) => f.rule_id === 'prebuilt-supply-voltage-range');
    expect(v).toHaveLength(1);
    expect(v[0].item_ids).toEqual(['psu', 'mcu']);
    expect(v[0].attributes).toContain('output_voltage');
  });
  it('does not cross-check parts on different rails', () => {
    const psu5 = item('psu5', { category: 'power', output_voltage: 5, output_current_max: 1, rail: '5v' });
    const m = item('m', { category: 'mcu', voltage_min: 3, voltage_max: 3.6, rail: '3v3' });
    expect(runRules([psu5, m], PREBUILT_RULES).filter((r) => r.status === 'failed')).toEqual([]);
  });
  it('checks the current budget including quantity', () => {
    const psu = item('psu', { category: 'power', output_voltage: 3.3, output_current_max: 1 });
    const loads = item('load', { category: 'sensor', voltage_min: 3, voltage_max: 3.6, current_max: 0.4, quantity: 3 });
    const res = runRules([psu, loads], PREBUILT_RULES);
    expect(res.find((r) => r.rule_id === 'prebuilt-current-budget')?.status).toBe('failed');
    const ok = runRules([psu, { ...loads, quantity: 2 }], PREBUILT_RULES);
    expect(ok.find((r) => r.rule_id === 'prebuilt-current-budget')?.status).toBe('passed');
  });
  it('skips (does not fail) when data is missing', () => {
    const psu = item('psu', { category: 'power', output_voltage: 5 });
    const bare = item('bare', { category: 'mcu' });
    const res = runRules([psu, bare], PREBUILT_RULES);
    expect(res.filter((r) => r.status === 'failed')).toEqual([]);
    expect(res.find((r) => r.rule_id === 'prebuilt-supply-voltage-range')?.status).toBe('skipped');
  });
  it('reports a component that does not fit the board', () => {
    const pcb = item('pcb', { category: 'pcb', width_mm: 50, length_mm: 80 });
    const big = item('big', { category: 'sensor', width_mm: 60, length_mm: 55 });
    const small = item('small', { category: 'sensor', width_mm: 20, length_mm: 70 });
    const res = runRules([pcb, big, small], PREBUILT_RULES).filter((r) => r.status === 'failed' && r.rule_id === 'prebuilt-fits-board');
    expect(res.map((r) => r.item_ids[1])).toEqual(['big']);
  });
});

describe('custom rules', () => {
  const rule: RuleDef = { id: 'c1', name: 'Same logic level', severity: 'warning', kind: 'pair', applies_a: 'a.category == "mcu"', applies_b: 'b.category == "sensor"', formula: 'a.logic_voltage == b.logic_voltage' };
  it('validates and runs', () => {
    expect(validateRuleDef(rule)).toEqual([]);
    const res = runRules([item('m', { category: 'mcu', logic_voltage: 3.3 }), item('s', { category: 'sensor', logic_voltage: 5 })], [rule]);
    expect(res[0]).toMatchObject({ status: 'failed', severity: 'warning', fingerprint: 'c1|m|s' });
  });
  it('reports a clear message for bad formulas', () => {
    expect(validateRuleDef({ ...rule, formula: 'a.x +' })[0]).toMatch(/unexpected/);
  });
});

describe('diff', () => {
  const s = (id: string, over: Partial<SnapshotItem> = {}): SnapshotItem => ({ item_id: id, component_id: 'c', mpn: id, name: id, manufacturer: '', category: '', quantity: 1, unit_price: 1, designator: '', rail: '', status: 'active', specs: {}, ...over });
  it('finds added, removed and modified lines with previous and current values', () => {
    const d = diffSnapshots([s('a'), s('b'), s('c', { specs: { voltage_max: 5 } })], [s('a'), s('c', { quantity: 4, specs: { voltage_max: 3.3 } }), s('d')]);
    expect(d.added.map((x) => x.item_id)).toEqual(['d']);
    expect(d.removed.map((x) => x.item_id)).toEqual(['b']);
    expect(d.unchanged).toBe(1);
    expect(d.modified[0].changes).toEqual(expect.arrayContaining([
      { field: 'quantity', previous: 1, current: 4 },
      { field: 'specs.voltage_max', previous: 5, current: 3.3 },
    ]));
  });
});
