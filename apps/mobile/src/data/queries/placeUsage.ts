import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { foldUsageRows, type PlaceUsage, type PlaceUsageRow } from '@lupira/cal-domain/placeUsage';

/** How your placed events (place and travel endpoints) have used each place up to `today`, folded as cal-api's
 *  `GET /place-usage` folds it: occurrences of items accepted into a calendar, cancelled ones and declined attendees left out. */
export async function placeUsageUpTo(tx: Tx, today: string): Promise<PlaceUsage[]> {
  const rows = await tx.all<{ place_id: string; label: string | null; category: string | null; day: string; contact_ids: string }>(
    `SELECT p.place_id, p.label, i.category, o.start_day AS day,
            (SELECT json_group_array(a.contact_id) FROM item_attendees a
             WHERE a.item_id = i.id AND a.status <> 'Declined') AS contact_ids
     FROM item_occurrences o
     JOIN item_index i ON i.id = o.item_id
     JOIN item_places p ON p.item_id = i.id
     WHERE o.start_day <= ?
       AND (i.status IS NULL OR i.status <> 'Cancelled')
       AND EXISTS (SELECT 1 FROM item_calendars c WHERE c.item_id = i.id AND c.status = 'Accepted')`,
    [today],
  );
  return foldUsageRows(rows.map((r): PlaceUsageRow => ({
    placeId: r.place_id,
    label: r.label,
    category: r.category,
    day: r.day,
    contactIds: JSON.parse(r.contact_ids) as string[],
  })));
}
