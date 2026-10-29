import { Queryable, json, many } from '../../db/pool';
import { newId } from '../../lib/ids';

export interface AuditEntry {
  projectId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: Record<string, unknown>;
}

/** Append-only record of who changed what (Audit Log for Compliance). */
export async function audit(q: Queryable, e: AuditEntry) {
  await q.query(
    'insert into audit_log (id, project_id, user_id, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [newId(), e.projectId, e.userId, e.action, e.entity, e.entityId ?? null, json(e.detail ?? {})],
  );
}

export async function listAudit(q: Queryable, projectId: string, limit: number, offset: number) {
  return many(
    q,
    `select a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, a.user_id, u.name as user_name
       from audit_log a left join users u on u.id = a.user_id
      where a.project_id = $1 order by a.created_at desc, a.id limit $2 offset $3`,
    [projectId, limit, offset],
  );
}
