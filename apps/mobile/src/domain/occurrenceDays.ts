import { isDayLong } from '@lupira/cal-domain/occurrences';
import { ymd } from '@lupira/cal-domain/time';

type SpanRow = { start_utc: string; start_day: string; end_utc: string | null; all_day: number };

/** The last day ('yyyy-MM-dd') an occurrence row covers, inclusive. An all-day end is the item's inclusive
 *  end date at UTC midnight; a timed end is an exclusive instant, so ending at midnight stays on the day. */
export function lastDayOf(row: SpanRow): string {
  if (!row.end_utc) return row.start_day;
  const last = row.all_day === 1 ? row.end_utc.slice(0, 10) : ymd(new Date(Date.parse(row.end_utc) - 1));
  return last > row.start_day ? last : row.start_day;
}

/** Timed rows of a day or longer belong in the all-day strip as bars (the shared `isDayLong` rule). */
export function isMultiDayTimed(row: SpanRow): boolean {
  return row.all_day !== 1 && isDayLong(new Date(row.start_utc), row.end_utc ? new Date(row.end_utc) : null);
}
