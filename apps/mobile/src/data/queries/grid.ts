import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { inShownCalendars, preferredCalendar, type CalendarFilter } from './calendarFilter';

export type GridSource = 'item' | 'birthday' | 'subscribed';

export type GridRow = {
  source: GridSource;
  source_id: string;
  /** The occurrence's key in its series, for opening that occurrence; null for one-off items and birthdays. */
  original_start: string | null;
  start_utc: string;
  end_utc: string | null;
  start_day: string;
  all_day: number;
  title: string | null;
  status: string | null;
  calendar_id: string | null;
  /** 1 when the item lives in the Availability-kind calendar — grids render these as the background
   *  band (status in avail_status), never as chips. */
  is_availability: number | null;
  avail_status: string | null;
  place_id: string | null;
  /** The item's (or subscription's) own colour name; null for the calendar's, and for birthdays. */
  color: string | null;
};

/** The grids' one read: item occurrences, birthdays and subscribed events joined with just enough display data
 *  (title, status, a calendar for the color). Indexed start_day ranges only — no per-item fan-out, no render-time
 *  expansion. */
export async function gridRowsBetween(
  tx: Tx, fromDay: string, toDay: string, filter?: CalendarFilter, hiddenSubscriptionIds: string[] = [],
): Promise<GridRow[]> {
  const shownFilter = filter ? `
       WHERE (CASE o.source
         WHEN 'item' THEN ${inShownCalendars('o.source_id')}
         WHEN 'subscribed' THEN o.calendar_id IN (SELECT value FROM json_each(?))
         ELSE ? END)` : '';
  return tx.all<GridRow>(
    `WITH o AS (
       SELECT 'item' AS source, item_id AS source_id, original_start, start_utc, end_utc, start_day, all_day, title, status,
              NULL AS calendar_id, NULL AS color
       FROM item_occurrences WHERE start_day >= ? AND start_day <= ?
       UNION ALL
       SELECT 'birthday', contact_id, NULL, start_utc, NULL, start_day, 1, NULL, NULL, NULL, NULL
       FROM birthday_occurrences WHERE start_day >= ? AND start_day <= ?
       UNION ALL
       SELECT 'subscribed', event_id, original_start, start_utc, end_utc, start_day, all_day, title, status, calendar_id, color
       FROM subscribed_occurrences WHERE start_day >= ? AND start_day <= ?
         AND subscription_id NOT IN (SELECT value FROM json_each(?))
     )
     SELECT o.source, o.source_id, o.original_start, o.start_utc, o.end_utc, o.start_day, o.all_day,
            COALESCE(o.title, i.title, c.display_name) AS title,
            COALESCE(o.status, i.status) AS status,
            COALESCE(o.calendar_id, ${preferredCalendar('o.source_id')}) AS calendar_id,
            (SELECT 1 FROM item_calendars ia JOIN calendar_index ca ON ca.id = ia.calendar_id
             WHERE ia.item_id = o.source_id AND ca.kind = 'Availability' LIMIT 1) AS is_availability,
            i.avail_status AS avail_status,
            i.place_id AS place_id,
            COALESCE(o.color, i.color) AS color
     FROM o
     LEFT JOIN item_index i ON o.source = 'item' AND i.id = o.source_id
     LEFT JOIN contact_index c ON o.source = 'birthday' AND c.id = o.source_id${shownFilter}
     ORDER BY o.start_utc`,
    [fromDay, toDay, fromDay, toDay, fromDay, toDay, JSON.stringify(hiddenSubscriptionIds),
      ...(filter ? [JSON.stringify(filter.calendarIds), JSON.stringify(filter.calendarIds), filter.birthdays ? 1 : 0] : [])],
  );
}
