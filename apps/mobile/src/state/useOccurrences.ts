import { addDays, addMonths, parseYmd, startOfMonth, ymd } from '@lupira/cal-domain/time';
import { useQueries, useQuery } from '@tanstack/react-query';
import { getDb } from '../data/db/expoDb';
import { gridRowsBetween, type GridRow } from '../data/mirror';
import { lastDayOf } from '../domain/occurrenceDays';
import type { TaskDeadlineRow } from '../domain/taskRows';
import { usePrefs } from './prefs-store';

/** Grid reads over the mirror, keyed ['occurrences', monthKey] — sync/reactivity.ts invalidates per month. */

const monthQuery = (monthKey: string, includeSystem: boolean) => ({
  // includeSystem rides the key AFTER the monthKey so per-month invalidation (prefix match) still works.
  queryKey: ['occurrences', monthKey, includeSystem] as const,
  queryFn: async () => gridRowsBetween(await getDb(), `${monthKey}-01`, `${monthKey}-31`, includeSystem),
});

export function useMonthOccurrences(monthKey: string) {
  const includeSystem = usePrefs((p) => p.showSystemCalendars);
  return useQuery<GridRow[]>(monthQuery(monthKey, includeSystem));
}

/** A run of days can straddle a month boundary (grid weeks do) — one query per touched month bucket keeps
 *  the monthKey invalidation contract intact. */
export function useDaysOccurrences(dayKeys: string[]): { rows: GridRow[]; loading: boolean } {
  const includeSystem = usePrefs((p) => p.showSystemCalendars);
  const monthKeys = [...new Set(dayKeys.map((d) => d.slice(0, 7)))];
  const results = useQueries({ queries: monthKeys.map((k) => monthQuery(k, includeSystem)) });
  const daySet = new Set(dayKeys);
  const rows = results
    .flatMap((r) => r.data ?? [])
    .filter((r) => daySet.has(r.start_day))
    .sort((a, b) => (a.start_utc < b.start_utc ? -1 : a.start_utc > b.start_utc ? 1 : 0));
  return { rows, loading: results.some((r) => r.isLoading) };
}

const SPAN_LOOKBACK_DAYS = 31;

/** The week grid's read: rows covering any of the (consecutive) days, including multi-day ones that
 *  began up to SPAN_LOOKBACK_DAYS earlier, which continue in from the left edge. Same per-month queries
 *  as useDaysOccurrences, so the invalidation contract holds. */
export function useOverlappingOccurrences(dayKeys: string[]): { rows: GridRow[]; loading: boolean } {
  const includeSystem = usePrefs((p) => p.showSystemCalendars);
  const first = dayKeys[0];
  const last = dayKeys[dayKeys.length - 1];
  const monthKeys: string[] = [];
  for (let m = startOfMonth(addDays(parseYmd(first), -SPAN_LOOKBACK_DAYS)); ymd(m) <= last; m = addMonths(m, 1))
    monthKeys.push(ymd(m).slice(0, 7));
  const results = useQueries({ queries: monthKeys.map((k) => monthQuery(k, includeSystem)) });
  const rows = results
    .flatMap((r) => r.data ?? [])
    .filter((r) => r.start_day <= last && lastDayOf(r) >= first)
    .sort((a, b) => (a.start_utc < b.start_utc ? -1 : a.start_utc > b.start_utc ? 1 : 0));
  return { rows, loading: results.some((r) => r.isLoading) };
}

/** The grids' union row type: mirror rows plus the online-only task-deadline source. */
export type CalRow = GridRow | TaskDeadlineRow;
