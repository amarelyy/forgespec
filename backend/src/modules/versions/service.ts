import { Queryable, json, many, one } from '../../db/pool';
import { HttpError, conflict, notFound } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { audit } from '../audit/service';
import { loadBomRows, toSnapshotItem } from '../bom/rows';
import { SnapshotItem, diffSnapshots, hasChanges, summarizeDiff } from './diff';

interface VersionRow {
  id: string;
  project_id: string;
  number: number;
  author_id: string;
  summary: string;
  snapshot: SnapshotItem[];
  created_at: string;
}

export async function currentSnapshot(q: Queryable, projectId: string): Promise<SnapshotItem[]> {
  return (await loadBomRows(q, projectId, ['active', 'deprecated'])).map(toSnapshotItem);
}

export async function listVersions(q: Queryable, projectId: string) {
  return many(
    q,
    `select v.id, v.number, v.summary, v.created_at, v.author_id, u.name as author_name,
            jsonb_array_length(v.snapshot) as item_count
       from versions v join users u on u.id = v.author_id
      where v.project_id = $1 order by v.number desc`,
    [projectId],
  );
}

export async function getVersion(q: Queryable, projectId: string, versionId: string) {
  const v = await one<VersionRow & { author_name: string }>(
    q,
    `select v.*, u.name as author_name from versions v join users u on u.id = v.author_id where v.id = $1 and v.project_id = $2`,
    [versionId, projectId],
  );
  if (!v) throw notFound('Version', 'VERSION_NOT_FOUND');
  return v;
}

/** Commit the working BOM as a new immutable snapshot. */
export async function commitVersion(q: Queryable, projectId: string, userId: string, summary?: string) {
  const snapshot = await currentSnapshot(q, projectId);
  const last = await one<VersionRow>(q, 'select * from versions where project_id = $1 order by number desc limit 1', [projectId]);
  const diff = diffSnapshots(last?.snapshot ?? [], snapshot);
  if (last && !hasChanges(diff)) throw conflict('NO_CHANGES', 'Nothing changed since the last version');
  if (!last && snapshot.length === 0) throw new HttpError(422, 'EMPTY_BOM', 'Add components before the first commit');

  const id = newId();
  const number = (last?.number ?? 0) + 1;
  const text = summary?.trim() || (last ? summarizeDiff(diff) : `Initial version with ${snapshot.length} component(s)`);
  await q.query(
    'insert into versions (id, project_id, number, author_id, summary, snapshot) values ($1,$2,$3,$4,$5,$6::jsonb)',
    [id, projectId, number, userId, text, json(snapshot)],
  );
  await audit(q, { projectId, userId, action: 'version.commit', entity: 'version', entityId: id, detail: { number, summary: text } });
  return { id, number, summary: text };
}

/** Resolve a version id or the literal "working" (uncommitted BOM) to a snapshot. */
async function resolveSide(q: Queryable, projectId: string, ref: string) {
  if (ref === 'working') return { label: 'working', snapshot: await currentSnapshot(q, projectId), version: null };
  const v = await getVersion(q, projectId, ref);
  return { label: `v${v.number}`, snapshot: v.snapshot, version: { id: v.id, number: v.number, summary: v.summary, created_at: v.created_at, author_name: v.author_name } };
}

export async function compareVersions(q: Queryable, projectId: string, from: string, to: string) {
  const [a, b] = await Promise.all([resolveSide(q, projectId, from), resolveSide(q, projectId, to)]);
  const diff = diffSnapshots(a.snapshot, b.snapshot);
  return { from: { label: a.label, version: a.version }, to: { label: b.label, version: b.version }, summary: summarizeDiff(diff), ...diff };
}
