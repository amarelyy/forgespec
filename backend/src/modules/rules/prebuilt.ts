import { RuleDef } from './engine';

/**
 * Pre-built, global, read-only rules (Rule Engine > Pre-built Rules).
 * Seeded into the `rules` table with project_id = NULL on migrate.
 *
 * The BOM has no netlist, so electrical cross-checks only compare parts on the
 * same `rail` (an optional label on each BOM line, empty = default rail).
 */
export const PREBUILT_RULES: RuleDef[] = [
  {
    id: 'prebuilt-supply-voltage-range',
    name: 'Supply voltage within input range',
    description: 'A power part\'s output voltage must lie inside the supply range of every consumer on the same rail.',
    severity: 'error',
    kind: 'pair',
    applies_a: 'a.category == "power" and not (a.output_voltage == 0)',
    applies_b: 'b.category != "power" and a.rail == b.rail',
    formula: 'between(a.output_voltage, b.voltage_min, b.voltage_max)',
  },
  {
    id: 'prebuilt-current-budget',
    name: 'Supply current budget',
    description: 'Total current drawn by consumers on a rail must not exceed what the supply can deliver.',
    severity: 'error',
    kind: 'aggregate',
    applies_a: 'a.category == "power"',
    applies_b: 'b.category != "power" and a.rail == b.rail',
    formula: 'sum(b.current_max * b.quantity) <= a.output_current_max * a.quantity',
  },
  {
    id: 'prebuilt-supply-voltage-sanity',
    name: 'Supply range is valid',
    description: 'Minimum supply voltage cannot be greater than maximum. Usually a unit-parsing mistake.',
    severity: 'warning',
    kind: 'single',
    applies_a: '',
    applies_b: '',
    formula: 'a.voltage_min <= a.voltage_max',
  },
  {
    id: 'prebuilt-fits-board',
    name: 'Component fits on board',
    description: 'Footprint of a component must fit inside the PCB or enclosure footprint (either orientation).',
    severity: 'warning',
    kind: 'pair',
    applies_a: 'a.category == "pcb" or a.category == "enclosure"',
    applies_b: 'b.category != "pcb" and b.category != "enclosure"',
    formula:
      'min(b.width_mm, b.length_mm) <= min(a.width_mm, a.length_mm) and max(b.width_mm, b.length_mm) <= max(a.width_mm, a.length_mm)',
  },
  {
    id: 'prebuilt-fits-height',
    name: 'Component fits under enclosure height',
    description: 'Height of a component must not exceed the enclosure height.',
    severity: 'warning',
    kind: 'pair',
    applies_a: 'a.category == "enclosure"',
    applies_b: 'b.category != "pcb" and b.category != "enclosure"',
    formula: 'b.height_mm <= a.height_mm',
  },
];
