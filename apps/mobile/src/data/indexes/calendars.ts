import type { Tx } from '@danbro96/lupira-expo-sqlite/types';

export const CALENDAR_TABLES = ['calendar_index'];

export const CALENDAR_DDL = 'CREATE TABLE calendar_index (id TEXT PRIMARY KEY, kind TEXT);';

export async function writeCalendarIndex(tx: Tx, id: string, state: { doc: { kind?: string | null } } | null): Promise<void> {
  await tx.run('DELETE FROM calendar_index WHERE id = ?', [id]);
  if (state) await tx.run('INSERT INTO calendar_index (id, kind) VALUES (?, ?)', [id, state.doc.kind ?? null]);
}
