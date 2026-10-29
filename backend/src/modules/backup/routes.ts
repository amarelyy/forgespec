import { Router } from 'express';
import { AppContext } from '../../context';
import { projectAccess, userId } from '../../middleware/auth';
import { createBackup, deleteBackup, listBackups, restoreBackup } from './service';

/** Admin-only, deliberately separate from normal project endpoints (restore overwrites state). */
export function backupRoutes(ctx: AppContext) {
  const r = Router();
  const admin = projectAccess(ctx.db, 'admin');

  r.get('/projects/:id/backups', admin, async (req, res) => {
    res.json({ backups: await listBackups(ctx.db, req.params.id as string) });
  });

  r.post('/projects/:id/backups', admin, async (req, res) => {
    res.status(201).json({ backup: await createBackup(ctx, req.params.id as string, userId(req)) });
  });

  r.post('/projects/:id/backups/:bid/restore', admin, async (req, res) => {
    res.json(await restoreBackup(ctx, req.params.id as string, req.params.bid as string, userId(req)));
  });

  r.delete('/projects/:id/backups/:bid', admin, async (req, res) => {
    await deleteBackup(ctx, req.params.id as string, req.params.bid as string);
    res.status(204).end();
  });

  return r;
}
