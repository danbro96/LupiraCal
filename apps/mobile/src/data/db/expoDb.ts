import { deleteDatabaseAsync } from 'expo-sqlite';
import { expoDb } from '@danbro96/lupira-expo-sqlite/expoDb';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';

const open = expoDb('lupira-calendar.db');
let legacyDropped: Promise<void> | null = null;

/** Upgrading wipes and resyncs: the pre-kernel mirror file, queued writes included, goes on first open. */
export async function getDb(): Promise<Db> {
  await (legacyDropped ??= deleteDatabaseAsync('lupira-calendar-mirror.db').catch(() => undefined));
  return open();
}
