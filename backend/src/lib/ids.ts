import { createHash, randomBytes, randomUUID } from 'crypto';

export const newId = () => randomUUID();
export const newToken = () => randomBytes(32).toString('hex');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
