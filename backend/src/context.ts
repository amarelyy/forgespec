import { Config } from './config';
import { Db } from './db/pool';
import { DistributorAdapter } from './modules/distributor/adapter';
import { Mailer } from './modules/notifications/mailer';
import { ObjectStorage } from './storage/storage';

/** Everything services need, injected once at startup (and swapped for fakes in tests). */
export interface AppContext {
  config: Config;
  db: Db;
  distributor: DistributorAdapter;
  storage: ObjectStorage;
  mailer: Mailer;
}
