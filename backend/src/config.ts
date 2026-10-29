import 'dotenv/config';

const env = process.env;

export interface Config {
  env: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtlDays: number;
  corsOrigin: string;
  storageDir: string;
  exportTtlHours: number;
  distributor: { provider: 'mock' | 'nexar'; nexarClientId?: string; nexarClientSecret?: string };
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const config: Config = {
    env: env.NODE_ENV ?? 'development',
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://forgespec:forgespec@localhost:5432/forgespec',
    jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
    accessTokenTtl: env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 7),
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    storageDir: env.STORAGE_DIR ?? './storage-data',
    exportTtlHours: Number(env.EXPORT_TTL_HOURS ?? 24),
    distributor: {
      provider: env.DISTRIBUTOR_PROVIDER === 'nexar' ? 'nexar' : 'mock',
      nexarClientId: env.NEXAR_CLIENT_ID,
      nexarClientSecret: env.NEXAR_CLIENT_SECRET,
    },
    ...overrides,
  };
  if (config.env === 'production' && config.jwtSecret === 'dev-only-secret-change-me') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return config;
}
