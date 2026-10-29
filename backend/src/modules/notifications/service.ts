import { AppContext } from '../../context';
import { Queryable, many, one } from '../../db/pool';
import { notFound } from '../../lib/errors';
import { newId } from '../../lib/ids';

export interface NotificationInput {
  userIds: string[];
  projectId?: string | null;
  type: 'bom_updated' | 'critical_error' | 'member_invited' | 'role_changed' | 'backup_restored';
  title: string;
  body?: string;
}

/**
 * In-app notification + best-effort email (Notification Service).
 * Never throws: a failed notification must not fail the BOM change that triggered it.
 */
export async function notify(ctx: AppContext, input: NotificationInput) {
  const ids = [...new Set(input.userIds)];
  for (const userId of ids) {
    try {
      await ctx.db.query(
        'insert into notifications (id, user_id, project_id, type, title, body) values ($1,$2,$3,$4,$5,$6)',
        [newId(), userId, input.projectId ?? null, input.type, input.title, input.body ?? ''],
      );
      const user = await one<{ email: string }>(ctx.db, 'select email from users where id = $1', [userId]);
      if (user) await ctx.mailer.send(user.email, input.title, input.body ?? '');
    } catch (e) {
      console.error('[notify] failed', (e as Error).message);
    }
  }
}

export async function projectMemberIds(q: Queryable, projectId: string, exceptUserId?: string): Promise<string[]> {
  const rows = await many<{ user_id: string }>(q, 'select user_id from project_members where project_id = $1', [projectId]);
  return rows.map((r) => r.user_id).filter((id) => id !== exceptUserId);
}

export async function listNotifications(q: Queryable, userId: string, unreadOnly: boolean, limit: number, offset: number) {
  return many(
    q,
    `select id, project_id, type, title, body, read, created_at from notifications
      where user_id = $1 ${unreadOnly ? 'and read = false' : ''}
      order by created_at desc, id limit $2 offset $3`,
    [userId, limit, offset],
  );
}

export async function unreadCount(q: Queryable, userId: string) {
  const row = await one<{ n: string | number }>(q, 'select count(*) as n from notifications where user_id = $1 and read = false', [userId]);
  return Number(row?.n ?? 0);
}

export async function markRead(q: Queryable, userId: string, id: string) {
  const { rowCount } = await q.query('update notifications set read = true where id = $1 and user_id = $2', [id, userId]);
  if (!rowCount) throw notFound('Notification');
}

export async function markAllRead(q: Queryable, userId: string) {
  await q.query('update notifications set read = true where user_id = $1 and read = false', [userId]);
}
