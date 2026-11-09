/**
 * Run the API against an in-memory PostgreSQL emulator: no Docker, no install. Data is lost on exit.
 * For trying the UI quickly only. Use `npm run dev` with real PostgreSQL for anything else.
 */
import bcrypt from 'bcryptjs';
import { DataType, newDb } from 'pg-mem';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { migrate } from '../src/db/migrate';
import { dbFromPool } from '../src/db/pool';
import { newId } from '../src/lib/ids';
import { DistributorAdapter } from '../src/modules/distributor/adapter';
import { MockProvider } from '../src/modules/distributor/mock';
import { ConsoleMailer } from '../src/modules/notifications/mailer';
import { LocalStorage } from '../src/storage/storage';

async function main() {
  const mem = newDb();
  mem.public.registerFunction({ name: 'jsonb_array_length', args: [DataType.jsonb], returns: DataType.integer, implementation: (x: unknown[]) => x.length });
  const { Pool } = mem.adapters.createPg();
  const db = dbFromPool(new Pool());
  await migrate(db);

  // Demo login for this in-memory server only, so there is always an account to try: admin@email.com / admin.
  // Inserted directly because sign-up requires 8+ characters. Never seed this into a real database.
  await db.query('insert into users (id, email, name, password_hash) values ($1,$2,$3,$4)', [newId(), 'admin@email.com', 'Admin', await bcrypt.hash('admin', 10)]);

  const config = loadConfig({ corsOrigin: 'http://localhost:5173' });
  const app = createApp({
    config,
    db,
    distributor: new DistributorAdapter(db, new MockProvider()),
    storage: new LocalStorage(config.storageDir),
    mailer: new ConsoleMailer(),
  });
  app.listen(config.port, () => {
    console.log(`ForgeSpec API (in-memory DB, sample catalogue) on http://localhost:${config.port}/api/v1`);
    console.log('Demo login: admin@email.com / admin');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
