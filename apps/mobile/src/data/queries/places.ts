import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { inShownCalendars, preferredCalendar, type CalendarFilter } from './calendarFilter';

export type PlacedEventRow = {
  source_id: string;
  start_utc: string;
  title: string | null;
  place_id: string;
  calendar_id: string | null;
};

/** One row per placed item with an occurrence in range. Recurring items repeat occurrence rows but share one
 *  place — GROUP BY collapses them to the earliest occurrence in the window. */
export async function placedEventsBetween(tx: Tx, fromDay: string, toDay: string, filter?: CalendarFilter): Promise<PlacedEventRow[]> {
  return tx.all<PlacedEventRow>(
    `SELECT o.item_id AS source_id, MIN(o.start_utc) AS start_utc, i.title, i.place_id,
            ${preferredCalendar('o.item_id')} AS calendar_id
     FROM item_occurrences o
     JOIN item_index i ON i.id = o.item_id
     WHERE o.start_day >= ? AND o.start_day <= ? AND i.place_id IS NOT NULL
       ${filter ? `AND ${inShownCalendars('o.item_id')}` : ''}
     GROUP BY o.item_id
     ORDER BY start_utc`,
    [fromDay, toDay, ...(filter ? [JSON.stringify(filter.calendarIds)] : [])],
  );
}
