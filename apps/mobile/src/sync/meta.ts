import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { getMeta, setMeta } from '@danbro96/lupira-sync-engine/metaStore';
import { KERNEL_MIGRATIONS } from '@danbro96/lupira-sync-engine/schema';
import { getDb } from '../data/db/expoDb';

/** App keys (prefs, bridge flags, horizon) in the kernel's meta table. Migrating here too lets prefs load before
 *  the engine first opens; the ladder is the kernel's own and idempotent. */
async function metaDb(): Promise<Db> {
  const db = await getDb();
  await migrate(db, KERNEL_MIGRATIONS);
  return db;
}

export async function readMeta(key: string): Promise<string | null> {
  return getMeta(await metaDb(), key);
}

export async function writeMeta(key: string, value: string): Promise<void> {
  const db = await metaDb();
  await db.exclusive((tx) => setMeta(tx, key, value));
}
