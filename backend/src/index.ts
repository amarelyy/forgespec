import { createApp } from './app';
import { loadConfig } from './config';
import { AppContext } from './context';
import { createPgDb } from './db/pool';
import { migrate } from './db/migrate';
import { DistributorAdapter } from './modules/distributor/adapter';
import { MockProvider } from './modules/distributor/mock';
import { NexarProvider } from './modules/distributor/nexar';
import { purgeExpiredExports } from './modules/export/service';
import { ConsoleMailer } from './modules/notifications/mailer';
import { LocalStorage } from './storage/storage';

async function main() {
  const config = loadConfig();
  const db = createPgDb(config.databaseUrl);
  await migrate(db);

  const { provider, nexarClientId, nexarClientSecret } = config.distributor;
  if (provider === 'nexar' && (!nexarClientId || !nexarClientSecret)) {
    throw new Error('DISTRIBUTOR_PROVIDER=nexar needs NEXAR_CLIENT_ID and NEXAR_CLIENT_SECRET');
  }
  const ctx: AppContext = {
    config,
    db,
    distributor: new DistributorAdapter(db, provider === 'nexar' ? new NexarProvider(nexarClientId!, nexarClientSecret!) : new MockProvider()),
    storage: new LocalStorage(config.storageDir),
    mailer: new ConsoleMailer(),
  };

  const server = createApp(ctx).listen(config.port, () => {
    console.log(`ForgeSpec API on :${config.port} (distributor: ${ctx.distributor.providerName})`);
  });

  const sweep = setInterval(() => purgeExpiredExports(ctx).catch((e) => console.error('[purge]', e)), 60 * 60_000);
  const stop = () => {
    clearInterval(sweep);
    server.close(() => db.close().finally(() => process.exit(0)));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
