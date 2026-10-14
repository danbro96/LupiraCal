import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { OCCURRENCE_COLUMNS, OCCURRENCE_JOINS, type ItemSearchRow } from './search';

export type ContactEventRow = ItemSearchRow & { rsvp: string };

/** Every mirrored item the contact attends, in search order: upcoming soonest-first, then past most-recent-first. */
export async function contactEvents(tx: Tx, contactId: string, today: string): Promise<ContactEventRow[]> {
  return tx.all<ContactEventRow>(
    `SELECT ${OCCURRENCE_COLUMNS}, a.status AS rsvp
     FROM item_attendees a
     JOIN item_index i ON i.id = a.item_id
     ${OCCURRENCE_JOINS}
     WHERE a.contact_id = ?
     ORDER BY next_utc IS NULL, next_utc, last_utc DESC`,
    [today, today, contactId],
  );
}
