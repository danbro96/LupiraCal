import { addDays, addMonths, parseYmd, startOfMonth, ymd } from '@danbro96/lupira-domain-core/time';
import { useQueries } from '@tanstack/react-query';
import { getDb } from '../data/db/expoDb';
import { gridRowsBetween, type CalendarFilter, type GridRow } from '../data/mirror';
import { lastDayOf } from '@lupira/cal-domain/occurrences';
import type { TaskDeadlineRow } from '../domain/taskRows';
import { useCalendarFilter } from './useContainers';

/** Grid reads over the mirror, keyed ['occurrences', monthKey] — sync/reactivity.ts invalidates per month. */

const monthQuery = (monthKey: string, filter: CalendarFilter | null) => ({
  // The filter rides the key AFTER the monthKey so per-month invalidation (prefix match) still works.
  queryKey: ['occurrences', monthKey, filter] as const,
  queryFn: async () => gridRowsBetween(await getDb(), `${monthKey}-01`, `${monthKey}-31`, filter!),
  enabled: filter !== null,
});

const SPAN_LOOKBACK_DAYS = 31;
const PREFETCH_DAYS = 7;

/** The grids' read: rows covering any of the (consecutive) days, including multi-day ones that began up
 *  to SPAN_LOOKBACK_DAYS earlier. Months a further PREFETCH_DAYS out either side are loaded too, so a
 *  pager's next step finds its data cached. One query per month bucket, so the invalidation contract holds. */
export function useOverlappingOccurrences(dayKeys: string[]): { rows: GridRow[]; loading: boolean } {
  const filter = useCalendarFilter();
  const first = dayKeys[0];
  const last = dayKeys[dayKeys.length - 1];
  const until = ymd(addDays(parseYmd(last), PREFETCH_DAYS));
  const monthKeys: string[] = [];
  for (let m = startOfMonth(addDays(parseYmd(first), -SPAN_LOOKBACK_DAYS - PREFETCH_DAYS)); ymd(m) <= until; m = addMonths(m, 1))
    monthKeys.push(ymd(m).slice(0, 7));
  const results = useQueries({ queries: monthKeys.map((k) => monthQuery(k, filter)) });
  const rows = results
    .flatMap((r) => r.data ?? [])
    .filter((r) => r.start_day <= last && lastDayOf(r.start_day, r.end_utc, r.all_day === 1) >= first)
    .sort((a, b) => (a.start_utc < b.start_utc ? -1 : a.start_utc > b.start_utc ? 1 : 0));
  return { rows, loading: results.some((r) => r.isLoading) };
}

/** The grids' union row type: mirror rows plus the online-only task-deadline source. */
export type CalRow = GridRow | TaskDeadlineRow;
