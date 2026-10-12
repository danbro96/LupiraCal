import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { preferredCalendar } from './calendarFilter';
import type { ItemSearchRow } from './search';

export type ContactEventRow = ItemSearchRow & { rsvp: string };

/** Every mirrored item the contact attends, in search order: upcoming soonest-first, then past most-recent-first. */
export async function contactEvents(tx: Tx, contactId: string, today: string): Promise<ContactEventRow[]> {
  return tx.all<ContactEventRow>(
    `SELECT i.id, i.title, i.status, i.is_all_day, i.recurrence_rule, a.status AS rsvp,
            ${preferredCalendar('i.id')} AS calendar_id,
            (SELECT MIN(o.start_utc) FROM item_occurrences o WHERE o.item_id = i.id AND o.start_day >= ?) AS next_utc,
            COALESCE((SELECT MAX(o.start_utc) FROM item_occurrences o WHERE o.item_id = i.id AND o.start_day < ?), i.start_utc) AS last_utc
     FROM item_attendees a
     JOIN item_index i ON i.id = a.item_id
     WHERE a.contact_id = ?
     ORDER BY next_utc IS NULL, next_utc, last_utc DESC`,
    [today, today, contactId],
  );
}
