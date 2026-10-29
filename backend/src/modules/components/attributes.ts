import { Dimension } from './units';

/**
 * Catalogue of attributes rules can reference. Served to the Custom Rule Builder
 * so users pick from selectable component attributes (US-05).
 */
export interface AttributeDef {
  key: string;
  label: string;
  type: 'number' | 'string';
  dimension?: Dimension;
  unit?: string;
  group: 'electrical' | 'physical' | 'general' | 'item';
  description: string;
}

export const ATTRIBUTES: AttributeDef[] = [
  { key: 'voltage_min', label: 'Supply voltage (min)', type: 'number', dimension: 'voltage', unit: 'V', group: 'electrical', description: 'Lowest supply voltage the part operates at' },
  { key: 'voltage_max', label: 'Supply voltage (max)', type: 'number', dimension: 'voltage', unit: 'V', group: 'electrical', description: 'Highest supply voltage the part tolerates' },
  { key: 'output_voltage', label: 'Output voltage', type: 'number', dimension: 'voltage', unit: 'V', group: 'electrical', description: 'Regulated or nominal output of a supply' },
  { key: 'current_max', label: 'Current draw (max)', type: 'number', dimension: 'current', unit: 'A', group: 'electrical', description: 'Maximum current the part draws from its rail' },
  { key: 'output_current_max', label: 'Output current (max)', type: 'number', dimension: 'current', unit: 'A', group: 'electrical', description: 'Maximum current a supply can deliver' },
  { key: 'power_max', label: 'Power (max)', type: 'number', dimension: 'power', unit: 'W', group: 'electrical', description: 'Maximum power dissipation or rating' },
  { key: 'logic_voltage', label: 'Logic level voltage', type: 'number', dimension: 'voltage', unit: 'V', group: 'electrical', description: 'I/O logic high level' },
  { key: 'frequency', label: 'Frequency', type: 'number', dimension: 'frequency', unit: 'Hz', group: 'electrical', description: 'Clock or operating frequency' },
  { key: 'temp_min_c', label: 'Operating temp (min)', type: 'number', dimension: 'temperature', unit: 'degC', group: 'electrical', description: 'Lowest operating temperature' },
  { key: 'temp_max_c', label: 'Operating temp (max)', type: 'number', dimension: 'temperature', unit: 'degC', group: 'electrical', description: 'Highest operating temperature' },
  { key: 'length_mm', label: 'Length', type: 'number', dimension: 'length', unit: 'mm', group: 'physical', description: 'Longest board-plane dimension' },
  { key: 'width_mm', label: 'Width', type: 'number', dimension: 'length', unit: 'mm', group: 'physical', description: 'Shorter board-plane dimension' },
  { key: 'height_mm', label: 'Height', type: 'number', dimension: 'length', unit: 'mm', group: 'physical', description: 'Height above the board' },
  { key: 'category', label: 'Category', type: 'string', group: 'general', description: 'e.g. mcu, power, sensor, pcb, enclosure' },
  { key: 'package_type', label: 'Package type', type: 'string', group: 'general', description: 'e.g. DIP-28, QFN-32, module' },
  { key: 'manufacturer', label: 'Manufacturer', type: 'string', group: 'general', description: '' },
  { key: 'mpn', label: 'Part number', type: 'string', group: 'general', description: 'Manufacturer part number' },
  { key: 'name', label: 'Name', type: 'string', group: 'general', description: '' },
  { key: 'quantity', label: 'Quantity', type: 'number', group: 'item', description: 'Quantity in this BOM' },
  { key: 'unit_price', label: 'Unit price', type: 'number', group: 'item', description: 'Unit price used in this BOM' },
  { key: 'rail', label: 'Power rail', type: 'string', group: 'item', description: 'Rail label; parts on different rails are not cross-checked by the built-in rules' },
];

export const ATTRIBUTE_MAP = new Map(ATTRIBUTES.map((a) => [a.key, a]));
export const SPEC_KEY_RE = /^[a-z][a-z0-9_]{0,47}$/;

/** Attributes stored in the specs jsonb (numeric, parsed from raw strings). */
export const NUMERIC_SPEC_KEYS = ATTRIBUTES.filter((a) => a.type === 'number' && a.group !== 'item').map((a) => a.key);
