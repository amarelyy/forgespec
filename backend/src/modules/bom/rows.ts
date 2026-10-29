import { Queryable, many } from '../../db/pool';
import { RuleItem } from '../rules/engine';
import { Specs, effectiveSpecs } from '../components/specs';
import { SnapshotItem } from '../versions/diff';

/** A BOM line joined with its library component. */
export interface BomRow {
  id: string;
  project_id: string;
  component_id: string;
  quantity: number;
  unit_price: number | null;
  supplier_url: string;
  designator: string;
  rail: string;
  notes: string;
  status: 'active' | 'deprecated' | 'removed';
  spec_overrides: Specs;
  created_at: string;
  updated_at: string;
  mpn: string;
  manufacturer: string;
  name: string;
  category: string;
  package_type: string;
  datasheet_url: string;
  lifecycle_status: string;
  stock: number | null;
  source: string;
  component_price: number | null;
  component_specs: Specs;
}

export async function loadBomRows(q: Queryable, projectId: string, statuses?: BomRow['status'][]): Promise<BomRow[]> {
  const rows = await many<BomRow>(
    q,
    `select b.*, c.mpn, c.manufacturer, c.name, c.category, c.package_type, c.datasheet_url, c.lifecycle_status,
            c.stock, c.source, c.price as component_price, c.specs as component_specs
       from bom_items b join components c on c.id = b.component_id
      where b.project_id = $1 order by b.created_at, b.id`,
    [projectId],
  );
  return statuses ? rows.filter((r) => statuses.includes(r.status)) : rows;
}

export const unitPrice = (r: BomRow) => r.unit_price ?? r.component_price ?? null;

/** The flat attribute bag formulas see as `a.*` / `b.*`. */
export function toRuleItem(r: BomRow): RuleItem {
  const price = unitPrice(r);
  return {
    ...effectiveSpecs(r.component_specs, r.spec_overrides),
    id: r.id,
    name: r.name,
    mpn: r.mpn,
    manufacturer: r.manufacturer,
    category: r.category,
    package_type: r.package_type,
    quantity: r.quantity,
    rail: r.rail,
    designator: r.designator,
    ...(price !== null ? { unit_price: price } : {}),
  };
}

export function toSnapshotItem(r: BomRow): SnapshotItem {
  return {
    item_id: r.id,
    component_id: r.component_id,
    mpn: r.mpn,
    name: r.name,
    manufacturer: r.manufacturer,
    category: r.category,
    quantity: r.quantity,
    unit_price: unitPrice(r),
    designator: r.designator,
    rail: r.rail,
    status: r.status,
    specs: effectiveSpecs(r.component_specs, r.spec_overrides),
  };
}
