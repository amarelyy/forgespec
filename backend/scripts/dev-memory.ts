/**
 * Run the API against an in-memory PostgreSQL emulator: no Docker, no install. Data is lost on exit.
 * For trying the UI quickly only. Use `npm run dev` with real PostgreSQL for anything else.
 */
import { DataType, newDb } from 'pg-mem';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { migrate } from '../src/db/migrate';
import { dbFromPool } from '../src/db/pool';
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

  const config = loadConfig({ corsOrigin: 'http://localhost:5173' });
  const app = createApp({
    config,
    db,
    distributor: new DistributorAdapter(db, new MockProvider()),
    storage: new LocalStorage(config.storageDir),
    mailer: new ConsoleMailer(),
  });
  app.listen(config.port, () => console.log(`ForgeSpec API (in-memory DB, sample catalogue) on http://localhost:${config.port}/api/v1`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
