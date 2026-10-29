import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { parse } from '../../lib/validate';
import { requireAuth, userId } from '../../middleware/auth';
import { getProfile, login, logout, refresh, register, updateProfile } from './service';

const password = z.string().min(8, 'at least 8 characters').max(128);

export function authRoutes(ctx: AppContext) {
  const r = Router();

  r.post('/auth/register', async (req, res) => {
    const input = parse(z.object({ email: z.string().email().max(200), name: z.string().trim().min(1).max(100), password }), req.body);
    res.status(201).json(await register(ctx, input));
  });

  r.post('/auth/login', async (req, res) => {
    const input = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    res.json(await login(ctx, input));
  });

  r.post('/auth/refresh', async (req, res) => {
    const { refresh_token } = parse(z.object({ refresh_token: z.string().min(1) }), req.body);
    res.json(await refresh(ctx, refresh_token));
  });

  r.post('/auth/logout', async (req, res) => {
    const { refresh_token } = parse(z.object({ refresh_token: z.string().min(1) }), req.body);
    await logout(ctx, refresh_token);
    res.status(204).end();
  });

  // Settings > Account Profile
  r.get('/profile', requireAuth, async (req, res) => {
    res.json({ user: await getProfile(ctx, userId(req)) });
  });

  r.put('/profile', requireAuth, async (req, res) => {
    const input = parse(
      z
        .object({ name: z.string().trim().min(1).max(100).optional(), current_password: z.string().optional(), new_password: password.optional() })
        .refine((b) => b.name !== undefined || b.new_password !== undefined, 'nothing to update'),
      req.body,
    );
    res.json({ user: await updateProfile(ctx, userId(req), input) });
  });

  return r;
}
