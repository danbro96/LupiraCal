// Local-time calendar math for the grids. Dates are JS Dates at local midnight; keys are 'yyyy-MM-dd'.

export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** count consecutive days starting at start's local midnight. */
export function daysFrom(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Monday-first week start. */
export function startOfWeek(d: Date): Date {
  const dow = (d.getDay() + 6) % 7;
  return addDays(startOfDay(d), -dow);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** The full Monday-first weeks covering d's month (4–6 rows of 7 days). */
export function monthMatrix(d: Date): Date[][] {
  const first = startOfMonth(d);
  const gridStart = startOfWeek(first);
  const weeks: Date[][] = [];
  let cursor = gridStart;
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  } while (cursor.getMonth() === d.getMonth());
  return weeks;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(d: Date): boolean {
  return sameDay(d, new Date());
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** A timed block's label on one day's column: its start — or, carried over from an earlier day, its end,
 *  since the start isn't on that column. */
export function fmtBlockTime(start: Date, end: Date, day: Date): string {
  return start < startOfDay(day) ? `until ${fmtTime(end)}` : fmtTime(start);
}

export function fmtMonthTitle(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function fmtDayTitle(d: Date, { year = true }: { year?: boolean } = {}): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(year && { year: 'numeric' }) });
}

export function isThisYear(d: Date, now = new Date()): boolean {
  return d.getFullYear() === now.getFullYear();
}

const fmtDayMonth = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** A week's title: "28 Sep – 4 Oct", with the year only when it isn't the current one, and on both ends
 *  when the range crosses a year. */
export function fmtWeekRange(start: Date, end: Date, now = new Date()): string {
  if (start.getFullYear() !== end.getFullYear()) return `${fmtDate(start)} – ${fmtDate(end)}`;
  const range = `${fmtDayMonth(start)} – ${fmtDayMonth(end)}`;
  return isThisYear(start, now) ? range : `${range} ${start.getFullYear()}`;
}

/** Monday-first short weekday names in the device's locale — the month grids' header row. */
export function weekdayNames(): string[] {
  // 1 January 2024 was a Monday.
  return daysFrom(new Date(2024, 0, 1), 7).map((d) => d.toLocaleDateString(undefined, { weekday: 'short' }));
}

export function fmtDayShort(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

/** All-day starts are midnight UTC — render the UTC date part; local conversion can shift the day. */
export function fmtWhen(startIso: string, isAllDay: boolean): string {
  if (isAllDay) return fmtDate(parseYmd(startIso.slice(0, 10)));
  return fmtDateTime(new Date(startIso));
}
