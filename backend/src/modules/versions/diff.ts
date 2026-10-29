/** Snapshot of one BOM line as stored in a version commit. */
export interface SnapshotItem {
  item_id: string;
  component_id: string;
  mpn: string;
  name: string;
  manufacturer: string;
  category: string;
  quantity: number;
  unit_price: number | null;
  designator: string;
  rail: string;
  status: string;
  /** Effective numeric specs (overrides applied). */
  specs: Record<string, number>;
}

export interface FieldChange {
  field: string;
  previous: unknown;
  current: unknown;
}

export interface VersionDiff {
  added: SnapshotItem[];
  removed: SnapshotItem[];
  modified: { item_id: string; mpn: string; name: string; changes: FieldChange[]; previous: SnapshotItem; current: SnapshotItem }[];
  unchanged: number;
}

const SCALAR_FIELDS: (keyof SnapshotItem)[] = ['component_id', 'quantity', 'unit_price', 'designator', 'rail', 'status'];

export function diffSnapshots(from: SnapshotItem[], to: SnapshotItem[]): VersionDiff {
  const before = new Map(from.map((i) => [i.item_id, i]));
  const after = new Map(to.map((i) => [i.item_id, i]));
  const diff: VersionDiff = { added: [], removed: [], modified: [], unchanged: 0 };

  for (const [id, cur] of after) {
    const prev = before.get(id);
    if (!prev) {
      diff.added.push(cur);
      continue;
    }
    const changes: FieldChange[] = [];
    for (const f of SCALAR_FIELDS) {
      if (prev[f] !== cur[f]) changes.push({ field: f, previous: prev[f], current: cur[f] });
    }
    for (const key of new Set([...Object.keys(prev.specs), ...Object.keys(cur.specs)])) {
      if (prev.specs[key] !== cur.specs[key]) changes.push({ field: `specs.${key}`, previous: prev.specs[key] ?? null, current: cur.specs[key] ?? null });
    }
    if (changes.length) diff.modified.push({ item_id: id, mpn: cur.mpn, name: cur.name, changes, previous: prev, current: cur });
    else diff.unchanged++;
  }
  for (const [id, prev] of before) if (!after.has(id)) diff.removed.push(prev);
  return diff;
}

export function summarizeDiff(d: VersionDiff): string {
  const parts: string[] = [];
  if (d.added.length) parts.push(`added ${d.added.length}`);
  if (d.removed.length) parts.push(`removed ${d.removed.length}`);
  if (d.modified.length) parts.push(`modified ${d.modified.length}`);
  return parts.length ? parts.join(', ') : 'no changes';
}

export const hasChanges = (d: VersionDiff) => d.added.length + d.removed.length + d.modified.length > 0;
