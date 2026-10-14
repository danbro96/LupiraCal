import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { inShownCalendars, preferredCalendar, type CalendarFilter } from './calendarFilter';

export type ItemSearchRow = {
  id: string;
  title: string | null;
  status: string | null;
  is_all_day: number;
  recurrence_rule: string | null;
  calendar_id: string | null;
  /** First occurrence on or after `today`; null when the item has none left in the mirror's window. */
  next_utc: string | null;
  /** Last occurrence before `today`, else the item's own start (it may predate the window). */
  last_utc: string | null;
  /** The occurrence a tap opens: the next one, else the last; null for one-off items. */
  occurrence: string | null;
};

/** An item's row as of `today`: its next occurrence (title and status as that occurrence reads), else its last. Binds `today` twice. */
export const OCCURRENCE_COLUMNS = `i.id, COALESCE(n.title, i.title) AS title, COALESCE(n.status, i.status) AS status, i.is_all_day, i.recurrence_rule,
            ${preferredCalendar('i.id')} AS calendar_id,
            n.start_utc AS next_utc,
            COALESCE(l.start_utc, i.start_utc) AS last_utc,
            COALESCE(n.original_start, l.original_start) AS occurrence`;

export const OCCURRENCE_JOINS = `LEFT JOIN item_occurrences n ON n.rowid =
       (SELECT o.rowid FROM item_occurrences o WHERE o.item_id = i.id AND o.start_day >= ? ORDER BY o.start_utc LIMIT 1)
     LEFT JOIN item_occurrences l ON l.rowid =
       (SELECT o.rowid FROM item_occurrences o WHERE o.item_id = i.id AND o.start_day < ? ORDER BY o.start_utc DESC LIMIT 1)`;

const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

/** Free-text search over the mirror, so it works offline. Every whitespace-separated term must appear in
 *  the title, description, category or tags. Upcoming items first (soonest first), then past ones (most
 *  recent first) — `today` is a local 'yyyy-MM-dd', compared against start_day so an all-day item on
 *  today still counts as upcoming. */
export async function searchItems(tx: Tx, query: string, today: string, filter?: CalendarFilter, limit = 100): Promise<ItemSearchRow[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return tx.all<ItemSearchRow>(
    `SELECT ${OCCURRENCE_COLUMNS}
     FROM item_index i
     ${OCCURRENCE_JOINS}
     WHERE ${terms.map(() => `i.search_text LIKE ? ESCAPE '\\'`).join('\n       AND ')}
       ${filter ? `AND ${inShownCalendars('i.id')}` : ''}
     ORDER BY next_utc IS NULL, next_utc, last_utc DESC
     LIMIT ?`,
    [today, today, ...terms.map(likeTerm), ...(filter ? [JSON.stringify(filter.calendarIds)] : []), limit],
  );
}
