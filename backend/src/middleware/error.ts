import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

/** Uniform error envelope: { error: { code, message, details? } } */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  // body-parser errors (bad JSON, payload too large) carry a status
  if (err?.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
