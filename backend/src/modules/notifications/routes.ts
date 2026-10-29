import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { parse } from '../../lib/validate';
import { requireAuth, userId } from '../../middleware/auth';
import { listNotifications, markAllRead, markRead, unreadCount } from './service';

export function notificationRoutes(ctx: AppContext) {
  const r = Router();
  const { db } = ctx;

  r.get('/notifications', requireAuth, async (req, res) => {
    const { unread, limit, offset } = parse(
      z.object({ unread: z.enum(['true', 'false']).default('false'), limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).default(0) }),
      req.query,
    );
    res.json({ notifications: await listNotifications(db, userId(req), unread === 'true', limit, offset) });
  });

  r.get('/notifications/unread-count', requireAuth, async (req, res) => {
    res.json({ unread: await unreadCount(db, userId(req)) });
  });

  r.post('/notifications/read-all', requireAuth, async (req, res) => {
    await markAllRead(db, userId(req));
    res.status(204).end();
  });

  r.patch('/notifications/:nid/read', requireAuth, async (req, res) => {
    await markRead(db, userId(req), req.params.nid as string);
    res.status(204).end();
  });

  return r;
}
