import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Config } from '../config';
import { Db, one } from '../db/pool';
import { forbidden, notFound, unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export type Role = 'viewer' | 'editor' | 'admin';
export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      projectRole?: Role;
    }
  }
}

/** API Gateway step 1: attach the user if a valid JWT is present. Guests pass through. */
export function authenticate(config: Config) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization');
    if (!header) return next();
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return next(unauthorized('Malformed Authorization header'));
    try {
      const p = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
      req.user = { id: String(p.sub), email: String(p.email), name: String(p.name) };
      next();
    } catch {
      next(unauthorized('Invalid or expired token'));
    }
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

export const userId = (req: Request) => req.user!.id;

/**
 * API Gateway step 2 (RBAC): the caller must be a member of :id with at least `min` role.
 * Non-members get 404 so project ids are not enumerable.
 */
export function projectAccess(db: Db, min: Role) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw unauthorized();
      const row = await one<{ role: Role }>(
        db,
        'select role from project_members where project_id = $1 and user_id = $2',
        [req.params.id, req.user.id],
      );
      if (!row) throw notFound('Project', 'PROJECT_NOT_FOUND');
      if (ROLE_RANK[row.role] < ROLE_RANK[min]) throw forbidden(`This action requires the ${min} role`);
      req.projectRole = row.role;
      next();
    } catch (e) {
      next(e);
    }
  };
}
