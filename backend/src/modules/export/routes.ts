import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { one } from '../../db/pool';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { projectAccess, requireAuth, userId } from '../../middleware/auth';
import { fetchExport, generateExport } from './service';

/** Export is two steps: generate (stored in object storage with a TTL), then download. */
export function exportRoutes(ctx: AppContext) {
  const r = Router();
  const viewer = projectAccess(ctx.db, 'viewer');

  r.post('/projects/:id/exports', viewer, async (req, res) => {
    const opts = parse(
      z.object({
        format: z.enum(['csv', 'pdf']),
        include_deprecated: z.boolean().default(false),
        include_removed: z.boolean().default(false),
      }),
      req.body,
    );
    res.status(201).json({ export: await generateExport(ctx, req.params.id as string, userId(req), opts) });
  });

  r.get('/exports/:eid/download', requireAuth, async (req, res) => {
    const file = await fetchExport(ctx, req.params.eid as string);
    const member = await one(ctx.db, 'select 1 from project_members where project_id = $1 and user_id = $2', [file.project_id, userId(req)]);
    if (!member) throw notFound('Export', 'EXPORT_NOT_FOUND');
    res.setHeader('Content-Type', file.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.data);
  });

  return r;
}
