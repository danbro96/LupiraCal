import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { inShownCalendars, preferredCalendar, type CalendarFilter } from './calendarFilter';

export type GridRow = {
  source: string;
  source_id: string;
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
};

/** The grids' one read: item occurrences and birthdays joined with just enough display data (title, status, a
 *  calendar for the color). Indexed start_day ranges only — no per-item fan-out, no render-time expansion. */
export async function gridRowsBetween(tx: Tx, fromDay: string, toDay: string, filter?: CalendarFilter): Promise<GridRow[]> {
  const shownFilter = filter ? `
       WHERE (CASE o.source WHEN 'item' THEN ${inShownCalendars('o.source_id')} ELSE ? END)` : '';
  return tx.all<GridRow>(
    `WITH o AS (
       SELECT 'item' AS source, item_id AS source_id, start_utc, end_utc, start_day, all_day
       FROM item_occurrences WHERE start_day >= ? AND start_day <= ?
       UNION ALL
       SELECT 'birthday', contact_id, start_utc, NULL, start_day, 1
       FROM birthday_occurrences WHERE start_day >= ? AND start_day <= ?
     )
     SELECT o.source, o.source_id, o.start_utc, o.end_utc, o.start_day, o.all_day,
            COALESCE(i.title, c.display_name) AS title,
            i.status AS status,
            ${preferredCalendar('o.source_id')} AS calendar_id,
            (SELECT 1 FROM item_calendars ia JOIN calendar_index ca ON ca.id = ia.calendar_id
             WHERE ia.item_id = o.source_id AND ca.kind = 'Availability' LIMIT 1) AS is_availability,
            i.avail_status AS avail_status,
            i.place_id AS place_id
     FROM o
     LEFT JOIN item_index i ON o.source = 'item' AND i.id = o.source_id
     LEFT JOIN contact_index c ON o.source = 'birthday' AND c.id = o.source_id${shownFilter}
     ORDER BY o.start_utc`,
    [fromDay, toDay, fromDay, toDay, ...(filter ? [JSON.stringify(filter.calendarIds), filter.birthdays ? 1 : 0] : [])],
  );
}
