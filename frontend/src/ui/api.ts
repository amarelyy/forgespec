import { BrowserTokenStore, createForgeSpecApi } from '../index';

/** The one shared API client. `/api/v1` is proxied to the backend in dev (see vite.config.ts). */
export const api = createForgeSpecApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
  tokens: new BrowserTokenStore(),
});
