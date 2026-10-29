import type { AuthSession } from '../api/types';

/** Error envelope from the API: { error: { code, message, details? } } */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 422 responses carry [{ path, message }] per invalid field. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !Array.isArray(this.details)) return {};
    return Object.fromEntries((this.details as { path: string; message: string }[]).map((d) => [d.path, d.message]));
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  get(): Tokens | null;
  set(tokens: Tokens | null): void;
}

export class MemoryTokenStore implements TokenStore {
  private tokens: Tokens | null = null;
  get() { return this.tokens; }
  set(t: Tokens | null) { this.tokens = t; }
}

/** Persists tokens in localStorage; falls back to memory when storage is unavailable (private mode, SSR). */
export class BrowserTokenStore implements TokenStore {
  private memory: Tokens | null = null;
  constructor(private key = 'forgespec.tokens') {}
  get() {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      if (raw) return JSON.parse(raw) as Tokens;
    } catch { /* fall through */ }
    return this.memory;
  }
  set(t: Tokens | null) {
    this.memory = t;
    try {
      if (t) globalThis.localStorage?.setItem(this.key, JSON.stringify(t));
      else globalThis.localStorage?.removeItem(this.key);
    } catch { /* memory copy is enough for this session */ }
  }
}

export interface HttpClientOptions {
  /** e.g. "http://localhost:4000/api/v1", or "/api/v1" behind a dev proxy */
  baseUrl: string;
  tokens?: TokenStore;
  fetch?: typeof fetch;
  /** Called when a refresh fails and the user must log in again. */
  onSessionExpired?: () => void;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  body?: unknown;
}

export class HttpClient {
  readonly tokens: TokenStore;
  private baseUrl: string;
  private doFetch: typeof fetch;
  private onSessionExpired?: () => void;
  private refreshing: Promise<boolean> | null = null;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.tokens = opts.tokens ?? new MemoryTokenStore();
    this.doFetch = opts.fetch ?? ((...a) => globalThis.fetch(...a));
    this.onSessionExpired = opts.onSessionExpired;
  }

  get isAuthenticated() {
    return this.tokens.get() !== null;
  }

  setSession(s: AuthSession | null) {
    this.tokens.set(s ? { accessToken: s.access_token, refreshToken: s.refresh_token } : null);
  }

  private url(path: string, query?: RequestOptions['query']) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
      else params.append(k, String(v));
    }
    const qs = params.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
  }

  private async send(method: string, path: string, opts: RequestOptions, retry: boolean): Promise<Response> {
    const headers: Record<string, string> = {};
    const t = this.tokens.get();
    if (t) headers.Authorization = `Bearer ${t.accessToken}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await this.doFetch(this.url(path, opts.query), { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    } catch (e) {
      throw new ApiError(0, 'NETWORK_ERROR', `Could not reach the server: ${(e as Error).message}`);
    }

    // Access token expired: refresh once (single flight), then replay the request.
    if (res.status === 401 && t && retry && !path.startsWith('/auth/')) {
      if (await this.refreshOnce()) return this.send(method, path, opts, false);
    }
    return res;
  }

  private refreshOnce(): Promise<boolean> {
    this.refreshing ??= (async () => {
      const t = this.tokens.get();
      try {
        if (!t) return false;
        const res = await this.doFetch(this.url('/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: t.refreshToken }),
        });
        if (!res.ok) throw new Error('refresh rejected');
        this.setSession((await res.json()) as AuthSession);
        return true;
      } catch {
        this.tokens.set(null);
        this.onSessionExpired?.();
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async fail(res: Response): Promise<never> {
    let code = 'HTTP_ERROR';
    let message = `Request failed with ${res.status}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) ({ code, message, details } = body.error);
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, code, message, details);
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.send(method, path, opts, true);
    if (!res.ok) return this.fail(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** Authenticated file download (exports). `path` may be the API-relative or full /api/v1 URL the API returned. */
  async download(path: string): Promise<{ blob: Blob; filename: string; contentType: string }> {
    const rel = path.replace(/^\/api\/v1/, '');
    const res = await this.send('GET', rel, {}, true);
    if (!res.ok) return this.fail(res);
    const disposition = res.headers.get('content-disposition') ?? '';
    return {
      blob: await res.blob(),
      filename: /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'download',
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  get = <T>(path: string, query?: RequestOptions['query']) => this.request<T>('GET', path, { query });
  post = <T>(path: string, body?: unknown) => this.request<T>('POST', path, { body: body ?? {} });
  put = <T>(path: string, body?: unknown) => this.request<T>('PUT', path, { body: body ?? {} });
  patch = <T>(path: string, body?: unknown) => this.request<T>('PATCH', path, { body: body ?? {} });
  delete = <T = void>(path: string, query?: RequestOptions['query']) => this.request<T>('DELETE', path, { query });
}
