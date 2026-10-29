import { Db, createPgDb } from './pool';
import { SCHEMA_SQL } from './schema';
import { seedPrebuiltRules } from '../modules/rules/service';

/** Idempotent: creates missing tables and syncs the pre-built rules. */
export async function migrate(db: Db) {
  const statements = SCHEMA_SQL.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const sql of statements) await db.query(sql);
  await seedPrebuiltRules(db);
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { loadConfig } = require('../config') as typeof import('../config');
  const db = createPgDb(loadConfig().databaseUrl);
  migrate(db)
    .then(() => console.log('migration complete'))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => db.close());
}
