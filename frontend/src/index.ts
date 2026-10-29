import { createEndpoints, ForgeSpecEndpoints } from './api/endpoints';
import { HttpClient, HttpClientOptions } from './lib/http';

export * from './api/types';
export { ApiError, BrowserTokenStore, HttpClient, MemoryTokenStore } from './lib/http';
export type { HttpClientOptions, TokenStore, Tokens } from './lib/http';
export type { ForgeSpecEndpoints } from './api/endpoints';

export interface ForgeSpecApi extends ForgeSpecEndpoints {
  http: HttpClient;
  /** True while a token pair is stored (it may still need a refresh). */
  readonly isAuthenticated: boolean;
}

/**
 * The only thing the UI layer needs:
 *
 *   const api = createForgeSpecApi({ baseUrl: import.meta.env.VITE_API_URL, tokens: new BrowserTokenStore() });
 *   await api.auth.login({ email, password });
 *   const projects = await api.projects.list();
 */
export function createForgeSpecApi(opts: HttpClientOptions): ForgeSpecApi {
  const http = new HttpClient(opts);
  const endpoints = createEndpoints(http);
  const api = { ...endpoints, http } as ForgeSpecApi;
  // A real getter: Object.assign/spread would copy the value once and freeze it.
  Object.defineProperty(api, 'isAuthenticated', { enumerable: true, get: () => http.isAuthenticated });
  return api;
}
