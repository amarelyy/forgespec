import { createContext, useContext } from 'react';
import { ApiError } from '../index';
import type { ForgeSpecApi, User } from '../index';

export interface Session {
  api: ForgeSpecApi;
  user: User;
  logout: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession needs a SessionContext');
  return s;
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server. Try again.');

export const money = (n: number) => `$${n.toFixed(2)}`;
