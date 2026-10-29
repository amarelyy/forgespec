import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { many, one } from '../../db/pool';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { projectAccess, userId } from '../../middleware/auth';
import { audit } from '../audit/service';
import { notify } from '../notifications/service';

const role = z.enum(['viewer', 'editor', 'admin']);

/** Settings > Team Members & Roles (US-10). */
export function teamRoutes(ctx: AppContext) {
  const r = Router();
  const { db } = ctx;
  const viewer = projectAccess(db, 'viewer');
  const admin = projectAccess(db, 'admin');

  const adminCount = async (projectId: string) =>
    Number((await one<{ n: string | number }>(db, `select count(*) as n from project_members where project_id = $1 and role = 'admin'`, [projectId]))!.n);

  r.get('/projects/:id/members', viewer, async (req, res) => {
    res.json({
      members: await many(db, `select u.id as user_id, u.name, u.email, m.role, m.created_at from project_members m join users u on u.id = m.user_id where m.project_id = $1 order by m.created_at, u.id`, [req.params.id as string]),
    });
  });

  // Invitations require an existing account (no email-invite flow in v1).
  r.post('/projects/:id/members', admin, async (req, res) => {
    const { email, role: newRole } = parse(z.object({ email: z.string().email(), role }), req.body);
    const projectId = req.params.id as string;
    const user = await one<{ id: string; name: string; email: string }>(db, 'select id, name, email from users where email = $1', [email.toLowerCase()]);
    if (!user) throw notFound('User with that email (they need to register first)', 'USER_NOT_FOUND');
    if (await one(db, 'select 1 from project_members where project_id = $1 and user_id = $2', [projectId, user.id])) throw conflict('ALREADY_MEMBER', 'That user is already on this project');
    const project = await one<{ name: string }>(db, 'select name from projects where id = $1', [projectId]);
    await db.tx(async (q) => {
      await q.query('insert into project_members (project_id, user_id, role) values ($1,$2,$3)', [projectId, user.id, newRole]);
      await audit(q, { projectId, userId: userId(req), action: 'member.invite', entity: 'member', entityId: user.id, detail: { email: user.email, role: newRole } });
    });
    await notify(ctx, { userIds: [user.id], projectId, type: 'member_invited', title: `You were added to ${project?.name ?? 'a project'}`, body: `Role: ${newRole}` });
    res.status(201).json({ member: { user_id: user.id, name: user.name, email: user.email, role: newRole } });
  });

  r.patch('/projects/:id/members/:uid', admin, async (req, res) => {
    const { role: newRole } = parse(z.object({ role }), req.body);
    const projectId = req.params.id as string;
    const target = await one<{ role: string }>(db, 'select role from project_members where project_id = $1 and user_id = $2', [projectId, req.params.uid as string]);
    if (!target) throw notFound('Member', 'MEMBER_NOT_FOUND');
    if (target.role === 'admin' && newRole !== 'admin' && (await adminCount(projectId)) <= 1) throw conflict('LAST_ADMIN', 'A project needs at least one admin');
    await db.tx(async (q) => {
      await q.query('update project_members set role = $3 where project_id = $1 and user_id = $2', [projectId, req.params.uid as string, newRole]);
      await audit(q, { projectId, userId: userId(req), action: 'member.role', entity: 'member', entityId: req.params.uid as string, detail: { from: target.role, to: newRole } });
    });
    await notify(ctx, { userIds: [req.params.uid as string], projectId, type: 'role_changed', title: 'Your project role changed', body: `New role: ${newRole}` });
    res.json({ member: { user_id: req.params.uid, role: newRole } });
  });

  // Admins remove anyone; members may remove themselves (leave).
  r.delete('/projects/:id/members/:uid', viewer, async (req, res) => {
    const projectId = req.params.id as string;
    const targetId = req.params.uid as string;
    if (targetId !== userId(req) && req.projectRole !== 'admin') throw forbidden('Only admins can remove other members');
    const target = await one<{ role: string }>(db, 'select role from project_members where project_id = $1 and user_id = $2', [projectId, targetId]);
    if (!target) throw notFound('Member', 'MEMBER_NOT_FOUND');
    if (target.role === 'admin' && (await adminCount(projectId)) <= 1) throw conflict('LAST_ADMIN', 'A project needs at least one admin');
    await db.tx(async (q) => {
      await q.query('delete from project_members where project_id = $1 and user_id = $2', [projectId, targetId]);
      await audit(q, { projectId, userId: userId(req), action: 'member.remove', entity: 'member', entityId: targetId });
    });
    res.status(204).end();
  });

  return r;
}
