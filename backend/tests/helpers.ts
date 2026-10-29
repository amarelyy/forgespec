import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { AppContext } from '../src/context';
import { migrate } from '../src/db/migrate';
import { Db, createPgDb, dbFromPool } from '../src/db/pool';
import { DistributorAdapter } from '../src/modules/distributor/adapter';
import { MockProvider } from '../src/modules/distributor/mock';
import { NullMailer } from '../src/modules/notifications/mailer';
import { MemoryStorage } from '../src/storage/storage';

/** Full app on an in-memory Postgres emulator, fake mailer and storage. */
export async function testApp() {
  let db: Db;
  if (process.env.TEST_DATABASE_URL) {
    // Run the same suite against a real PostgreSQL: TEST_DATABASE_URL=postgres://... npm test
    db = createPgDb(process.env.TEST_DATABASE_URL);
    await db.query('drop schema public cascade');
    await db.query('create schema public');
  } else {
    const mem = newDb();
    // Real PostgreSQL built-in that pg-mem does not ship.
    mem.public.registerFunction({ name: 'jsonb_array_length', args: [DataType.jsonb], returns: DataType.integer, implementation: (x: unknown[]) => x.length });
    const { Pool } = mem.adapters.createPg();
    db = dbFromPool(new Pool());
  }
  await migrate(db);
  const mailer = new NullMailer();
  const storage = new MemoryStorage();
  const ctx: AppContext = {
    config: loadConfig({ jwtSecret: 'test-secret', env: 'test' }),
    db,
    distributor: new DistributorAdapter(db, new MockProvider()),
    storage,
    mailer,
  };
  const app = createApp(ctx);
  const api = request(app);

  let n = 0;
  const signup = async (name = 'User') => {
    const email = `${name.toLowerCase()}${++n}@example.com`;
    const res = await api.post('/api/v1/auth/register').send({ email, name, password: 'password123' });
    if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
    return { email, token: res.body.access_token as string, refresh: res.body.refresh_token as string, id: res.body.user.id as string };
  };
  const as = (token: string) => ({
    get: (url: string) => api.get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
    post: (url: string) => api.post(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
    put: (url: string) => api.put(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => api.patch(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => api.delete(`/api/v1${url}`).set('Authorization', `Bearer ${token}`),
  });
  return { ctx, api, signup, as, mailer, storage };
}
