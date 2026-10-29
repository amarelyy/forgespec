import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { parse } from '../../lib/validate';
import { projectAccess, requireAuth, userId } from '../../middleware/auth';
import { listAudit } from '../audit/service';
import {
  createProject,
  deleteProject,
  deleteTemplate,
  getProject,
  listProjects,
  listTemplates,
  saveAsTemplate,
  updateProject,
} from './service';

export function projectRoutes(ctx: AppContext) {
  const r = Router();
  const { db } = ctx;
  const viewer = projectAccess(db, 'viewer');
  const editor = projectAccess(db, 'editor');
  const admin = projectAccess(db, 'admin');

  // Dashboard
  r.get('/projects', requireAuth, async (req, res) => {
    res.json({ projects: await listProjects(db, userId(req)) });
  });

  r.post('/projects', requireAuth, async (req, res) => {
    const input = parse(z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).optional(), template_id: z.string().optional() }), req.body);
    const id = await createProject(ctx, userId(req), input);
    res.status(201).json({ project: await getProject(db, id, 'admin') });
  });

  // Templates are per user. Registered before /projects/:id.
  r.get('/projects/templates', requireAuth, async (req, res) => {
    res.json({ templates: await listTemplates(db, userId(req)) });
  });

  r.delete('/projects/templates/:tid', requireAuth, async (req, res) => {
    await deleteTemplate(db, userId(req), req.params.tid as string);
    res.status(204).end();
  });

  r.get('/projects/:id', viewer, async (req, res) => {
    res.json({ project: await getProject(db, req.params.id as string, req.projectRole!) });
  });

  r.put('/projects/:id', editor, async (req, res) => {
    const input = parse(z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().max(1000).optional() }), req.body);
    await updateProject(db, req.params.id as string, userId(req), input);
    res.json({ project: await getProject(db, req.params.id as string, req.projectRole!) });
  });

  r.delete('/projects/:id', admin, async (req, res) => {
    await deleteProject(db, req.params.id as string);
    res.status(204).end();
  });

  r.post('/projects/:id/template', editor, async (req, res) => {
    const input = parse(z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(500).optional() }), req.body);
    const id = await saveAsTemplate(db, req.params.id as string, userId(req), input);
    res.status(201).json({ template_id: id });
  });

  // Settings > Audit log (admin only)
  r.get('/projects/:id/audit-log', admin, async (req, res) => {
    const { limit, offset } = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) }), req.query);
    res.json({ entries: await listAudit(db, req.params.id as string, limit, offset) });
  });

  return r;
}
