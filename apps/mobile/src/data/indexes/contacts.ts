import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { composeDisplayName } from '../../domain/displayName';
import { birthdayRows, currentHorizon } from '../../domain/materialize';
import type { MirrorContact } from '../../domain/mirrorReducers';

export const CONTACT_TABLES = ['contact_index', 'birthday_occurrences'];

export const CONTACT_DDL = `
  CREATE TABLE contact_index (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    address_book_id TEXT NOT NULL
  );
  CREATE TABLE birthday_occurrences (
    contact_id TEXT NOT NULL,
    start_utc TEXT NOT NULL,
    start_day TEXT NOT NULL,
    PRIMARY KEY (contact_id, start_utc)
  );
  CREATE INDEX birthday_occurrences_day ON birthday_occurrences (start_day);
`;

export async function writeContactIndex(tx: Tx, id: string, state: MirrorContact | null): Promise<void> {
  await tx.run('DELETE FROM contact_index WHERE id = ?', [id]);
  await tx.run('DELETE FROM birthday_occurrences WHERE contact_id = ?', [id]);
  if (!state) return;
  const d = state.doc;
  await tx.run('INSERT INTO contact_index (id, display_name, address_book_id) VALUES (?, ?, ?)',
    [id, composeDisplayName(d), d.addressBookId]);
  for (const r of birthdayRows(d, currentHorizon()))
    await tx.run('INSERT OR REPLACE INTO birthday_occurrences (contact_id, start_utc, start_day) VALUES (?, ?, ?)', [id, r.startUtc, r.startDay]);
}
