import { AppContext } from '../../context';
import { Queryable, json, many, one } from '../../db/pool';
import { newId } from '../../lib/ids';
import { notFound, unprocessable } from '../../lib/errors';
import { audit } from '../audit/service';
import { notify, projectMemberIds } from '../notifications/service';
import { evaluateProject } from '../rules/service';
import { commitVersion } from '../versions/service';

interface BackupFile {
  format: 1;
  taken_at: string;
  project: { name: string; description: string };
  components: any[];
  items: any[];
  rules: any[];
}

/** Admin backup of one project's BOM + custom rules, stored as JSON in object storage. */
export async function createBackup(ctx: AppContext, projectId: string, userId: string) {
  const project = await one<{ name: string; description: string }>(ctx.db, 'select name, description from projects where id = $1', [projectId]);
  if (!project) throw notFound('Project', 'PROJECT_NOT_FOUND');
  const items = await many<any>(ctx.db, 'select * from bom_items where project_id = $1 order by created_at, id', [projectId]);
  const ids = [...new Set(items.map((i) => i.component_id))];
  const components = ids.length ? await many<any>(ctx.db, 'select * from components where id = any($1::text[])', [ids]) : [];
  const rules = await many<any>(ctx.db, 'select * from rules where project_id = $1', [projectId]);
  const file: BackupFile = { format: 1, taken_at: new Date().toISOString(), project, components, items, rules };
  const body = Buffer.from(JSON.stringify(file));

  const id = newId();
  const key = `backups/${projectId}/${id}.json`;
  await ctx.storage.put(key, body);
  await ctx.db.query('insert into backups (id, project_id, created_by, storage_key, size_bytes) values ($1,$2,$3,$4,$5)', [id, projectId, userId, key, body.length]);
  await audit(ctx.db, { projectId, userId, action: 'backup.create', entity: 'backup', entityId: id, detail: { items: items.length } });
  return { id, size_bytes: body.length, item_count: items.length, created_at: file.taken_at };
}

export const listBackups = (q: Queryable, projectId: string) =>
  many(q, `select b.id, b.size_bytes, b.created_at, u.name as created_by_name from backups b join users u on u.id = b.created_by where b.project_id = $1 order by b.created_at desc, b.id`, [projectId]);

export async function deleteBackup(ctx: AppContext, projectId: string, backupId: string) {
  const b = await one<{ storage_key: string }>(ctx.db, 'select storage_key from backups where id = $1 and project_id = $2', [backupId, projectId]);
  if (!b) throw notFound('Backup', 'BACKUP_NOT_FOUND');
  await ctx.storage.delete(b.storage_key);
  await ctx.db.query('delete from backups where id = $1', [backupId]);
}

/**
 * Restore overwrites the project's BOM lines and custom rules with the backup's.
 * Version history, members and the audit log are never rewritten; the restore is
 * recorded as a new version so it can be diffed and, if needed, reversed.
 */
export async function restoreBackup(ctx: AppContext, projectId: string, backupId: string, userId: string) {
  const meta = await one<{ storage_key: string }>(ctx.db, 'select storage_key from backups where id = $1 and project_id = $2', [backupId, projectId]);
  if (!meta) throw notFound('Backup', 'BACKUP_NOT_FOUND');
  const raw = await ctx.storage.get(meta.storage_key);
  if (!raw) throw notFound('Backup file', 'BACKUP_NOT_FOUND');
  let file: BackupFile;
  try {
    file = JSON.parse(raw.toString('utf8'));
  } catch {
    throw unprocessable('BACKUP_CORRUPT', 'Backup file is unreadable');
  }
  if (file.format !== 1 || !Array.isArray(file.items) || !Array.isArray(file.components) || !Array.isArray(file.rules)) {
    throw unprocessable('BACKUP_CORRUPT', 'Backup file has an unknown format');
  }

  const evaluation = await ctx.db.tx(async (q) => {
    for (const c of file.components) {
      if (await one(q, 'select id from components where id = $1', [c.id])) continue;
      await q.query(
        `insert into components (id, source, owner_id, mpn, manufacturer, name, category, description, package_type, datasheet_url, lifecycle_status, stock, price, specs)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
        [c.id, c.source, c.owner_id, c.mpn, c.manufacturer, c.name, c.category, c.description, c.package_type, c.datasheet_url, c.lifecycle_status, c.stock, c.price, json(c.specs)],
      );
    }
    await q.query('delete from bom_items where project_id = $1', [projectId]);
    await q.query('delete from rules where project_id = $1', [projectId]);
    for (const i of file.items) {
      await q.query(
        `insert into bom_items (id, project_id, component_id, quantity, unit_price, supplier_url, designator, rail, notes, status, spec_overrides)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [i.id, projectId, i.component_id, i.quantity, i.unit_price, i.supplier_url, i.designator, i.rail, i.notes, i.status, json(i.spec_overrides)],
      );
    }
    for (const r of file.rules) {
      await q.query(
        `insert into rules (id, project_id, name, description, severity, kind, applies_a, applies_b, formula, enabled, builtin, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11)`,
        [r.id, projectId, r.name, r.description, r.severity, r.kind, r.applies_a, r.applies_b, r.formula, r.enabled, r.created_by],
      );
    }
    await q.query('update projects set updated_at = now() where id = $1', [projectId]);
    await audit(q, { projectId, userId, action: 'backup.restore', entity: 'backup', entityId: backupId, detail: { taken_at: file.taken_at, items: file.items.length } });
    const ev = await evaluateProject(q, projectId);
    try {
      await commitVersion(q, projectId, userId, `Restored from backup of ${file.taken_at.slice(0, 16).replace('T', ' ')}`);
    } catch {
      // nothing changed or empty BOM: no new version needed
    }
    return ev;
  });

  await notify(ctx, { userIds: await projectMemberIds(ctx.db, projectId, userId), projectId, type: 'backup_restored', title: 'Project restored from a backup', body: `Taken ${file.taken_at}` });
  return { restored_items: file.items.length, summary: evaluation.summary };
}
