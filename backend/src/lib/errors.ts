export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, 'FORBIDDEN', msg);
export const notFound = (what = 'Resource', code = 'NOT_FOUND') => new HttpError(404, code, `${what} not found`);
export const conflict = (code: string, msg: string, details?: unknown) => new HttpError(409, code, msg, details);
export const unprocessable = (code: string, msg: string, details?: unknown) => new HttpError(422, code, msg, details);
