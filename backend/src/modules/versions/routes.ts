import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { parse } from '../../lib/validate';
import { projectAccess, userId } from '../../middleware/auth';
import { commitVersion, compareVersions, getVersion, listVersions } from './service';

export function versionRoutes(ctx: AppContext) {
  const r = Router();
  const { db } = ctx;
  const viewer = projectAccess(db, 'viewer');
  const editor = projectAccess(db, 'editor');

  r.get('/projects/:id/versions', viewer, async (req, res) => {
    res.json({ versions: await listVersions(db, req.params.id as string) });
  });

  r.post('/projects/:id/versions', editor, async (req, res) => {
    const { summary } = parse(z.object({ summary: z.string().trim().max(300).optional() }), req.body ?? {});
    res.status(201).json({ version: await db.tx((q) => commitVersion(q, req.params.id as string, userId(req), summary)) });
  });

  // ?from=<versionId|working>&to=<versionId|working>  (registered before :vid)
  r.get('/projects/:id/versions/compare', viewer, async (req, res) => {
    const { from, to } = parse(z.object({ from: z.string().min(1), to: z.string().min(1) }), req.query);
    res.json(await compareVersions(db, req.params.id as string, from, to));
  });

  r.get('/projects/:id/versions/:vid', viewer, async (req, res) => {
    res.json({ version: await getVersion(db, req.params.id as string, req.params.vid as string) });
  });

  return r;
}
