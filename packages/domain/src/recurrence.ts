// TS twin of cal-api's RecurrenceExpander (Ical.Net-backed): expands an RFC 5545 recurrence rule into concrete
// UTC occurrence starts within a half-open window [windowStart, windowEnd). Parity with the server is pinned by
// test/fixtures/recurrence.json, emitted from the server expander itself — the fixtures are the spec.
//
// Deliberately a subset: FREQ D/W/M/Y, INTERVAL, COUNT, UNTIL, BYDAY (incl. ordinals), BYMONTHDAY, BYMONTH,
// WKST. Anything else parses to null and the caller renders the first occurrence only (flagged in the UI).
// Instants are UTC. A timed series with a start zone recurs on that zone's wall clock, like the server's: the rule
// math runs on wall-clock ms and only the window compares real instants.

import { fromWallMs, isValidTimeZone, toWallMs } from './zonedTime';

export type RecurrenceRule = {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count: number | null;
  /** Epoch ms, inclusive (RFC: the last possible instance). */
  until: number | null;
  byDay: { ord: number | null; weekday: number }[];
  byMonthDay: number[];
  byMonth: number[];
  /** 0=SU … 6=SA; default Monday. */
  wkst: number;
};

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const KNOWN_PARTS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST']);

export function parseRecurrenceRule(text: string): RecurrenceRule | null {
  const rule: RecurrenceRule = {
    freq: 'DAILY', interval: 1, count: null, until: null, byDay: [], byMonthDay: [], byMonth: [], wkst: 1,
  };
  let sawFreq = false;
  for (const part of text.trim().replace(/^RRULE:/i, '').split(';')) {
    if (!part) continue;
    const [key, value] = part.split('=');
    if (!key || value === undefined || !KNOWN_PARTS.has(key.toUpperCase())) return null;
    switch (key.toUpperCase()) {
      case 'FREQ': {
        const f = value.toUpperCase();
        if (f !== 'DAILY' && f !== 'WEEKLY' && f !== 'MONTHLY' && f !== 'YEARLY') return null;
        rule.freq = f;
        sawFreq = true;
        break;
      }
      case 'INTERVAL': {
        rule.interval = Number(value);
        if (!Number.isInteger(rule.interval) || rule.interval < 1) return null;
        break;
      }
      case 'COUNT': {
        rule.count = Number(value);
        if (!Number.isInteger(rule.count) || rule.count < 1) return null;
        break;
      }
      case 'UNTIL': {
        const until = parseUntil(value);
        if (until === null) return null;
        rule.until = until;
        break;
      }
      case 'BYDAY': {
        for (const token of value.toUpperCase().split(',')) {
          const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token);
          if (!m) return null;
          rule.byDay.push({ ord: m[1] ? Number(m[1]) : null, weekday: WEEKDAYS[m[2]] });
        }
        break;
      }
      case 'BYMONTHDAY': {
        rule.byMonthDay = value.split(',').map(Number);
        if (rule.byMonthDay.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) return null;   // negative BYMONTHDAY: out of subset
        break;
      }
      case 'BYMONTH': {
        rule.byMonth = value.split(',').map(Number);
        if (rule.byMonth.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) return null;
        break;
      }
      case 'WKST': {
        const w = WEEKDAYS[value.toUpperCase()];
        if (w === undefined) return null;
        rule.wkst = w;
        break;
      }
    }
  }
  return sawFreq ? rule : null;
}

function parseUntil(value: string): number | null {
  let m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59);   // date-only UNTIL covers its whole day
  return null;
}

/// Occurrence starts (ascending, UTC) of `ruleText` anchored at `start`, clipped to [windowStart, windowEnd).
/// Null = the rule is outside the supported subset. Matching the server (the fixtures are the spec): only
/// pattern-matching instants ≥ start are occurrences — a DTSTART that doesn't match the rule is NOT emitted —
/// and COUNT counts occurrences from the first match, consuming ones before the window. `timeZone` is the series'
/// start zone (absent or unknown = UTC, as on the server). `maxOccurrences` guards infinite rules against
/// pathological windows.
export function expandRecurrence(
  ruleText: string,
  start: Date,
  windowStart: Date,
  windowEnd: Date,
  timeZone: string | null = null,
  maxOccurrences = 10_000,
): Date[] | null {
  const rule = parseRecurrenceRule(ruleText);
  if (!rule) return null;
  if (rule.byDay.some((d) => d.ord !== null) && rule.freq !== 'MONTHLY' && rule.freq !== 'YEARLY') return null;

  const zone = isValidTimeZone(timeZone) && timeZone !== 'UTC' ? timeZone : null;
  const toInstant = zone ? (wall: number) => fromWallMs(wall, zone) : (wall: number) => wall;
  const anchor = zone ? new Date(toWallMs(start.getTime(), zone)) : start;

  const out: Date[] = [];
  let produced = 0;
  const consider = (wall: number): 'emitted' | 'skipped' | 'done' => {
    // The server evaluates rules zone-less, so UNTIL bounds the wall clock even when it carries a Z.
    if (rule.until !== null && wall > rule.until) return 'done';
    produced++;
    if (rule.count !== null && produced > rule.count) return 'done';
    const t = toInstant(wall);
    if (t >= windowEnd.getTime()) return 'done';
    if (t >= windowStart.getTime()) {
      out.push(new Date(t));
      if (out.length >= maxOccurrences) return 'done';
    }
    return 'skipped';
  };

  const anchorMs = anchor.getTime();
  const timeOfDay = anchorMs - utcMidnight(anchor);
  const maxPeriods = 5_000;
  for (let period = 0; period < maxPeriods; period++) {
    const candidates = periodCandidates(rule, anchor, period).filter((t) => t + timeOfDay >= anchorMs);
    candidates.sort((a, b) => a - b);
    for (const day of candidates) {
      const status = consider(day + timeOfDay);
      if (status === 'done') return out;
    }
    // Past the window with nothing left to count — stop walking periods.
    const periodFloor = candidates.length > 0 ? candidates[0] : null;
    if (periodFloor !== null && toInstant(periodFloor + timeOfDay) >= windowEnd.getTime() && rule.count === null) return out;
  }
  return out;
}

/// Candidate day-instants (UTC midnight ms) for one period of the rule, unfiltered by DTSTART/window.
function periodCandidates(rule: RecurrenceRule, start: Date, period: number): number[] {
  const step = period * rule.interval;
  switch (rule.freq) {
    case 'DAILY': {
      const day = utcMidnight(start) + step * DAY_MS;
      if (!monthAllowed(rule, day) || !weekdayAllowed(rule, day)) return [];
      return [day];
    }
    case 'WEEKLY': {
      const anchor = weekStart(utcMidnight(start), rule.wkst) + step * 7 * DAY_MS;
      const weekdays = rule.byDay.length > 0
        ? new Set(rule.byDay.map((d) => d.weekday))
        : new Set([start.getUTCDay()]);
      const days: number[] = [];
      for (let off = 0; off < 7; off++) {
        const day = anchor + off * DAY_MS;
        if (weekdays.has(new Date(day).getUTCDay()) && monthAllowed(rule, day)) days.push(day);
      }
      return days;
    }
    case 'MONTHLY': {
      const y = start.getUTCFullYear();
      const m = start.getUTCMonth() + step;
      const day = monthDays(rule, y, m, start.getUTCDate());
      return day.filter((d) => monthAllowed(rule, d));
    }
    case 'YEARLY': {
      const y = start.getUTCFullYear() + step;
      const months = rule.byMonth.length > 0 ? rule.byMonth.map((m) => m - 1) : [start.getUTCMonth()];
      return months.flatMap((m) => monthDays(rule, y, m, start.getUTCDate()));
    }
  }
}

/// Days (UTC midnight ms) the rule selects inside year/month (month may overflow — Date.UTC normalizes).
function monthDays(rule: RecurrenceRule, year: number, month: number, fallbackDayOfMonth: number): number[] {
  const first = Date.UTC(year, month, 1);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  if (rule.byMonthDay.length > 0)
    return rule.byMonthDay.filter((d) => d <= daysInMonth).map((d) => first + (d - 1) * DAY_MS);

  if (rule.byDay.length > 0) {
    const days: number[] = [];
    for (const { ord, weekday } of rule.byDay) {
      const matching: number[] = [];
      for (let d = 0; d < daysInMonth; d++) {
        const day = first + d * DAY_MS;
        if (new Date(day).getUTCDay() === weekday) matching.push(day);
      }
      if (ord === null) days.push(...matching);
      else if (ord > 0 && ord <= matching.length) days.push(matching[ord - 1]);
      else if (ord < 0 && matching.length + ord >= 0) days.push(matching[matching.length + ord]);
    }
    return days;
  }

  return fallbackDayOfMonth <= daysInMonth ? [first + (fallbackDayOfMonth - 1) * DAY_MS] : [];
}

const DAY_MS = 86_400_000;

const utcMidnight = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

function weekStart(dayMs: number, wkst: number): number {
  const weekday = new Date(dayMs).getUTCDay();
  return dayMs - ((weekday - wkst + 7) % 7) * DAY_MS;
}

function monthAllowed(rule: RecurrenceRule, dayMs: number): boolean {
  return rule.byMonth.length === 0 || rule.byMonth.includes(new Date(dayMs).getUTCMonth() + 1);
}

function weekdayAllowed(rule: RecurrenceRule, dayMs: number): boolean {
  return rule.byDay.length === 0 || rule.byDay.some((d) => d.weekday === new Date(dayMs).getUTCDay());
}
