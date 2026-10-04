import { parseYmd, ymd } from '@danbro96/lupira-domain-core/time';

/** The galleries' time navigation: `/photos/stats` month counts grouped by year, and the local day
 *  bounds a year or month selects — the same 'yyyy-MM-dd' vocabulary a map pin hands over. */

export interface TimelineMonth {
  /** 'yyyy-MM' */
  key: string;
  count: number;
}

export interface TimelineYear {
  year: string;
  count: number;
  months: TimelineMonth[];
}

export interface DayRange {
  from: string;
  to: string;
}

/** The stats bucket by UTC month, so a photo taken within hours of a month boundary can be counted
 *  in the neighbouring month from the one its local-day filter lands it in. */
export function photoTimeline(byMonth: Readonly<Record<string, number>>, newestFirst: boolean): TimelineYear[] {
  const keys = Object.keys(byMonth).filter((k) => /^\d{4}-\d{2}$/.test(k) && byMonth[k] > 0).sort();
  if (newestFirst) keys.reverse();
  const years: TimelineYear[] = [];
  for (const key of keys) {
    const year = key.slice(0, 4);
    let last = years.at(-1);
    if (last?.year !== year) {
      last = { year, count: 0, months: [] };
      years.push(last);
    }
    last.count += byMonth[key];
    last.months.push({ key, count: byMonth[key] });
  }
  return years;
}

export function yearRange(year: string): DayRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function monthRange(key: string): DayRange {
  const [y, m] = key.split('-').map(Number);
  return { from: `${key}-01`, to: ymd(new Date(y, m, 0)) };
}

export type WholeSpan = { kind: 'year'; year: string } | { kind: 'month'; key: string };

/** Whether a day range is exactly one calendar year or month — how the timeline marks what is selected. */
export function wholeSpan(from: string, to: string): WholeSpan | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  const year = yearRange(from.slice(0, 4));
  if (from === year.from && to === year.to) return { kind: 'year', year: from.slice(0, 4) };
  const month = monthRange(from.slice(0, 7));
  if (from === month.from && to === month.to) return { kind: 'month', key: from.slice(0, 7) };
  return null;
}

export function fmtMonth(key: string, month: 'short' | 'long'): string {
  return parseYmd(`${key}-01`).toLocaleDateString(undefined, { month });
}

/** "2024", "July 2024", or the day range — the date filter chip's label. */
export function fmtPhotoRange(from: string, to?: string): string {
  const span = to ? wholeSpan(from, to) : null;
  if (span?.kind === 'year') return span.year;
  if (span?.kind === 'month') {
    return parseYmd(`${span.key}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const start = parseYmd(from).toLocaleDateString(undefined, { dateStyle: 'medium' });
  if (!to || to === from) return start;
  return `${start} – ${parseYmd(to).toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

export interface TimelineMatch {
  range: DayRange;
  label: string;
  count: number;
}

/** Years and months whose name holds every word of the query — "2024", "jul", "jul 2023". */
export function matchTimeline(years: readonly TimelineYear[], query: string, max: number): TimelineMatch[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hit = (label: string) => words.every((w) => label.toLocaleLowerCase().includes(w));
  const matches: TimelineMatch[] = [];
  for (const y of years) {
    if (hit(y.year)) matches.push({ range: yearRange(y.year), label: y.year, count: y.count });
    for (const m of y.months) {
      const label = `${fmtMonth(m.key, 'long')} ${y.year}`;
      if (hit(label)) matches.push({ range: monthRange(m.key), label, count: m.count });
    }
  }
  return matches.slice(0, max);
}

/** The photo search box: from this many characters, offering this many of each kind. */
export const PHOTO_SEARCH = { minQuery: 2, events: 6, places: 5, dates: 4 } as const;

