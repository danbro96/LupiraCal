// The event form both apps edit: its fields, the new-event defaults, how moving one schedule field moves the
// others, and how the fields become a schedule the API takes. Wall-clock fields are read in `timeZone`, so a
// duration is kept on the clock the user sees, not in elapsed time across a DST change.

import { deviceTimeZone, isoToWall, wallToIso } from './zonedTime';
import { ymd } from './time';

export type PlaceRef = { placeId: string; label: string };

export type ItemForm = {
  title: string;
  description: string;
  status: string;          // '' = keep unset
  category: string;
  tagsCsv: string;
  isAllDay: boolean;
  startDay: string;        // 'yyyy-MM-dd', '' = none
  startTime: string;       // 'HH:MM' (timed only)
  /** Timed: the end's day. All-day: the last day, inclusive — as cal-api stores it. */
  endDay: string;
  endTime: string;
  recurrenceRule: string;  // '' = none
  /** IANA zone the timed fields are read in; '' only where the runtime can't name its own zone. */
  timeZone: string;
  place: PlaceRef | null;
};

export type ScheduleField = 'startDay' | 'startTime' | 'endDay' | 'endTime';

export type EditResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** No day = a blank schedule. A day alone starts at the next half hour today, 09:00 otherwise; either way the
 *  event defaults to one hour, and the end may roll past midnight. */
export function emptyItemForm(day?: string, time?: string, now: Date = new Date()): ItemForm {
  const form: ItemForm = {
    title: '', description: '', status: '', category: '', tagsCsv: '', isAllDay: false,
    startDay: '', startTime: '', endDay: '', endTime: '', recurrenceRule: '',
    timeZone: deviceTimeZone() ?? '', place: null,
  };
  if (!day) return form;
  const startTime = time ?? defaultStartTime(day, now);
  const end = wallFromMs(wallMs(day, startTime) + HOUR_MS);
  return { ...form, startDay: day, startTime, endDay: end.day, endTime: end.time };
}

export function defaultStartTime(day: string, now: Date): string {
  if (day !== ymd(now)) return '09:00';
  const nextHalfHour = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30;
  const minutes = Math.min(nextHalfHour, 23 * 60 + 30);   // stay on the day that was picked
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** One schedule field changed. Moving the start carries the end along (same duration, on the wall clock);
 *  completing a start on an endless event gives it an hour. Changing the end never moves the start, and the
 *  end is never left half-set: picking one end field completes the other. */
export function withSchedule<F extends ItemForm>(form: F, field: ScheduleField, value: string): F {
  const next = { ...form, [field]: value };
  if (field === 'endDay' || field === 'endTime') {
    if (form.isAllDay || !value || !form.startDay || !form.startTime) return next;
    if (field === 'endDay' && !form.endTime) next.endTime = wallFromMs(wallMs(form.startDay, form.startTime) + HOUR_MS).time;
    // An end time alone reads as the same evening, or past midnight when it's not after the start.
    if (field === 'endTime' && !form.endDay) next.endDay = value > form.startTime ? form.startDay : addDaysYmd(form.startDay, 1);
    return next;
  }
  if (form.isAllDay) {
    if (field === 'startDay' && form.startDay && value && form.endDay)
      next.endDay = addDaysYmd(form.endDay, daysBetween(form.startDay, value));
    return next;
  }
  if (!next.startDay || !next.startTime) return next;
  if (form.startDay && form.startTime && form.endDay && form.endTime) {
    const delta = wallMs(next.startDay, next.startTime) - wallMs(form.startDay, form.startTime);
    const end = wallFromMs(wallMs(form.endDay, form.endTime) + delta);
    return { ...next, endDay: end.day, endTime: end.time };
  }
  if (!next.endDay && !next.endTime) {
    const end = wallFromMs(wallMs(next.startDay, next.startTime) + HOUR_MS);
    return { ...next, endDay: end.day, endTime: end.time };
  }
  return next;
}

/** Flipping all-day keeps the days: a timed span past midnight becomes a multi-day range, and a range turned
 *  timed starts at 09:00 for an hour. */
export function withAllDay<F extends ItemForm>(form: F, isAllDay: boolean): F {
  if (isAllDay === form.isAllDay) return form;
  if (isAllDay) {
    // An end at midnight closes the previous day.
    const lastDay = form.endDay && form.endTime === '00:00' ? addDaysYmd(form.endDay, -1) : form.endDay;
    const endDay = lastDay && form.startDay && lastDay > form.startDay ? lastDay : '';
    return { ...form, isAllDay, startTime: '', endTime: '', endDay };
  }
  if (!form.startDay) return { ...form, isAllDay, endDay: '' };
  const end = wallFromMs(wallMs(form.startDay, '09:00') + HOUR_MS);
  return { ...form, isAllDay, startTime: '09:00', endDay: end.day, endTime: end.time };
}

/** A new event's sensible all-day default from its category: some categories are day-scoped, some timed.
 *  null = no opinion, leave the form alone. */
export function categoryAllDayDefault(category: string): boolean | null {
  if (category === 'Occasion' || category === 'Trip' || category === 'Stay') return true;
  if (category === 'Meeting' || category === 'Appointment' || category === 'Focus') return false;
  return null;
}

export type FormSchedule = {
  isAllDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  startDate: string | null;
  endDate: string | null;
  /** DTEND reads in the start's zone; the server keeps no separate end zone on the read side. */
  startTimezone: string | null;
};

/** The schedule half of the form as the API takes it, or why it can't be saved. */
export function scheduleFromForm(form: ItemForm): EditResult<FormSchedule> {
  const s: FormSchedule = {
    isAllDay: form.isAllDay, startsAt: null, endsAt: null, startDate: null, endDate: null,
    startTimezone: form.isAllDay ? null : (form.timeZone || null),
  };
  if (form.isAllDay) {
    if (form.endDay && form.startDay && form.endDay < form.startDay) return { ok: false, error: 'End date is before the start date' };
    if (form.endDay && !form.startDay) return { ok: false, error: 'End date needs a start date' };
    s.startDate = form.startDay || null;
    s.endDate = form.endDay || null;
  } else {
    if (form.startDay && !form.startTime) return { ok: false, error: 'Start needs a time' };
    if (form.startTime && !form.startDay) return { ok: false, error: 'Start needs a date' };
    if ((form.endDay || form.endTime) && !(form.endDay && form.endTime)) return { ok: false, error: 'End needs both date and time' };
    s.startsAt = form.startDay ? wallToIso(form.startDay, form.startTime, form.timeZone) : null;
    s.endsAt = form.endDay ? wallToIso(form.endDay, form.endTime, form.timeZone) : null;
    if (s.endsAt && !s.startsAt) return { ok: false, error: 'End needs a start' };
    if (s.endsAt && s.startsAt && s.endsAt <= s.startsAt) return { ok: false, error: 'End is not after the start' };
  }
  if (form.recurrenceRule.trim() && !s.startsAt && !s.startDate) return { ok: false, error: 'Recurrence needs a start' };
  return { ok: true, value: s };
}

/** A saved event's start moved: where its end goes, keeping the duration on the event's own wall clock. */
export function movedEnd(startIso: string, endIso: string, newStartIso: string, zone: string | null): string {
  const before = isoToWall(startIso, zone);
  const after = isoToWall(newStartIso, zone);
  const end = isoToWall(endIso, zone);
  const moved = wallFromMs(wallMs(end.day, end.time) + wallMs(after.day, after.time) - wallMs(before.day, before.time));
  return wallToIso(moved.day, moved.time, zone);
}

/** A comma-separated list as typed: trimmed, empties dropped, repeats (any case) kept once. */
export function parseList(csv: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of csv.split(',')) {
    const t = raw.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export function addDaysYmd(day: string, n: number): string {
  return wallFromMs(wallMs(day, '00:00') + n * DAY_MS).day;
}

/** Zone-free wall-clock arithmetic: the fields as ms read as if UTC. */
function wallMs(day: string, time: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm);
}

function wallFromMs(ms: number): { day: string; time: string } {
  const d = new Date(ms);
  return {
    day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((wallMs(to, '00:00') - wallMs(from, '00:00')) / DAY_MS);
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
