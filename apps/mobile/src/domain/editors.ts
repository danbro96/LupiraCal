import { inputToPartialDate, partialDateToInput } from '@lupira/cal-domain/partialDate';
import { deviceTimeZone, instantToWall, isValidTimeZone, wallToInstant } from '@lupira/cal-domain/zonedTime';
import type { CalendarMembership, ContactDoc, ItemAttendee, ItemDoc } from './docTypes';
import type { ContactCore, ItemCore } from './ops';

/** Form ⇄ op-core translation, kept pure so the wart-heavy parts are vitest-covered: which empty field means
 *  "keep" (title/description/status/category have no REST clear) vs "clear" (the sentinel-backed schedule
 *  fields and tags), the timed/all-day duality, and which zone the wall-clock fields are in. Screens own only
 *  widgets and submission. */

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
  /** Timed: the end's day. All-day: the LAST day, inclusive — storage is exclusive. */
  endDay: string;
  endTime: string;
  recurrenceRule: string;  // '' = none
  /** IANA zone the timed fields are read in; '' only where the engine can't name the device's zone. */
  timeZone: string;
  place: PlaceRef | null;
};

export type ScheduleField = 'startDay' | 'startTime' | 'endDay' | 'endTime';

/** No day = a blank schedule. A day alone (the FAB) starts at the next half hour today, 09:00 otherwise;
 *  either way the event defaults to one hour, and the end may roll past midnight. */
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
  if (day !== localDay(now)) return '09:00';
  const nextHalfHour = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30;
  const minutes = Math.min(nextHalfHour, 23 * 60 + 30);   // stay on the day that was picked
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** One schedule field changed. Moving the start carries the end along (same duration, on the wall clock);
 *  completing a start on an endless event gives it an hour. Changing the end never moves the start, and the
 *  end is never left half-set: picking one end field completes the other. */
export function withSchedule(form: ItemForm, field: ScheduleField, value: string): ItemForm {
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
export function withAllDay(form: ItemForm, isAllDay: boolean): ItemForm {
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

/** Smart default when picking a category on a NEW event with an untouched schedule: some categories are
 *  obviously day-scoped, some obviously timed. null = no opinion, leave the form alone. */
export function categoryAllDayDefault(category: string): boolean | null {
  if (category === 'Occasion' || category === 'Trip' || category === 'Stay') return true;
  if (category === 'Meeting' || category === 'Appointment' || category === 'Focus') return false;
  return null;
}

/** A doc without a usable zone opens in the device's, and saving stamps that zone on it. */
export function itemFormFromDoc(doc: ItemDoc): ItemForm {
  const allDay = doc.isAllDay === true;
  const timeZone = !allDay && isValidTimeZone(doc.startTimezone) ? doc.startTimezone : (deviceTimeZone() ?? '');
  const wall = (iso: string | null | undefined) => (!allDay && iso ? wallOf(iso, timeZone) : { day: '', time: '' });
  const start = wall(doc.startsAt);
  const end = wall(doc.endsAt);
  const lastDay = allDay && doc.endDate ? addDaysYmd(doc.endDate, -1) : '';
  return {
    title: doc.title ?? '',
    description: doc.description ?? '',
    status: doc.status ?? '',
    category: doc.category ?? '',
    tagsCsv: (doc.tags ?? []).join(', '),
    isAllDay: allDay,
    startDay: allDay ? (doc.startDate ?? '') : start.day,
    startTime: start.time,
    endDay: allDay ? (lastDay && lastDay >= (doc.startDate ?? '') ? lastDay : '') : end.day,
    endTime: end.time,
    recurrenceRule: doc.recurrenceRule ?? '',
    timeZone,
    place: doc.placeId ? { placeId: doc.placeId, label: doc.locationLabel ?? '' } : null,
  };
}

export type EditResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** `base` supplies the fields the form doesn't edit (parentItemId) so the whole-section write keeps them. */
export function itemCoreFromForm(form: ItemForm, base?: ItemDoc): EditResult<ItemCore> {
  const zone = form.isAllDay ? null : (form.timeZone || null);
  const core: ItemCore = {
    title: form.title.trim() || null,
    description: form.description.trim() || null,
    status: form.status || null,
    category: form.category || null,
    tags: parseCsv(form.tagsCsv),
    parentItemId: base?.parentItemId ?? null,
    isAllDay: form.isAllDay,
    startsAt: null, endsAt: null, startDate: null, endDate: null,
    // DTEND reads in the start's zone; the server keeps no separate end zone on the read side.
    startTimezone: zone, endTimezone: zone,
    recurrenceRule: form.recurrenceRule.trim() || null,
    placeId: form.place?.placeId ?? null,
    location: form.place?.label.trim() || null,
  };

  if (form.isAllDay) {
    if (form.endDay && form.startDay && form.endDay < form.startDay)
      return { ok: false, error: 'End date is before the start date' };
    if (form.endDay && !form.startDay) return { ok: false, error: 'End date needs a start date' };
    core.startDate = form.startDay || null;
    core.endDate = form.endDay ? addDaysYmd(form.endDay, 1) : null;
  } else {
    if (form.startDay && !form.startTime) return { ok: false, error: 'Start needs a time' };
    if (form.startTime && !form.startDay) return { ok: false, error: 'Start needs a date' };
    if ((form.endDay || form.endTime) && !(form.endDay && form.endTime))
      return { ok: false, error: 'End needs both date and time' };
    core.startsAt = form.startDay ? isoOf(form.startDay, form.startTime, form.timeZone) : null;
    core.endsAt = form.endDay ? isoOf(form.endDay, form.endTime, form.timeZone) : null;
    if (core.endsAt && !core.startsAt) return { ok: false, error: 'End needs a start' };
    if (core.endsAt && core.startsAt && core.endsAt <= core.startsAt)
      return { ok: false, error: 'End is not after the start' };
  }
  if (core.recurrenceRule && !core.startsAt && !core.startDate)
    return { ok: false, error: 'Recurrence needs a start' };
  return { ok: true, value: core };
}

/** The doc's own core, verbatim — for one-field writes (cancel, restore) that must not touch the rest. */
export function coreOfDoc(doc: ItemDoc): ItemCore {
  return {
    title: doc.title ?? null,
    description: doc.description ?? null,
    status: doc.status ?? null,
    category: doc.category ?? null,
    tags: null,
    parentItemId: doc.parentItemId ?? null,
    isAllDay: doc.isAllDay === true,
    startsAt: doc.startsAt ?? null,
    endsAt: doc.endsAt ?? null,
    startDate: doc.startDate ?? null,
    endDate: doc.endDate ?? null,
    startTimezone: doc.startTimezone ?? null,
    endTimezone: doc.startTimezone ?? null,
    recurrenceRule: doc.recurrenceRule ?? null,
  };
}

export function acceptedCalendarIds(memberships: CalendarMembership[]): string[] {
  return memberships.filter((m) => m.status === 'Accepted').map((m) => m.calendarId);
}

/** Selecting a proposed calendar accepts it; a proposal left unselected stays a proposal. */
export function filingChanges(memberships: CalendarMembership[], selected: string[]): { file: string[]; unfile: string[] } {
  const accepted = new Set(acceptedCalendarIds(memberships));
  return {
    file: selected.filter((id) => !accepted.has(id)),
    unfile: [...accepted].filter((id) => !selected.includes(id)),
  };
}

export function attendeeChanges(attendees: ItemAttendee[], selected: string[]): { invite: string[]; uninvite: string[] } {
  const current = new Set(attendees.map((a) => a.contactId));
  return {
    invite: selected.filter((id) => !current.has(id)),
    uninvite: [...current].filter((id) => !selected.includes(id)),
  };
}

export function metadataInputOf(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** A key keeps its JSON type: text stays text, and anything else must parse — editing `3` must not store "3". */
export function metadataValueFromInput(input: string, previous: unknown): EditResult<unknown> {
  if (previous === undefined || typeof previous === 'string') return { ok: true, value: input };
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch {
    return { ok: false, error: 'This key holds JSON — enter a valid JSON value' };
  }
}

export type ContactForm = {
  givenName: string;
  middleName: string;
  familyName: string;
  nickname: string;
  displayNameFormat: string;   // '' = keep unset
  kind: string;
  /** Two input shapes: with a known year, `birthday` holds 'yyyy-MM-dd' (date picker); without one,
   *  month/day live in their own fields and no fake year ever exists anywhere. */
  birthday: string;
  birthdayYearKnown: boolean;
  birthdayMonth: string;       // '1'..'12' when the year is unknown
  birthdayDay: string;         // '1'..'31'
  notes: string;
  pronouns: string;
};

export function emptyContactForm(): ContactForm {
  return {
    givenName: '', middleName: '', familyName: '', nickname: '', displayNameFormat: '', kind: '',
    birthday: '', birthdayYearKnown: true, birthdayMonth: '', birthdayDay: '', notes: '', pronouns: '',
  };
}

export function contactFormFromDoc(doc: ContactDoc): ContactForm {
  const yearKnown = doc.birthday ? doc.birthday.year != null : true;
  return {
    givenName: doc.givenName ?? '',
    middleName: doc.middleName ?? '',
    familyName: doc.familyName ?? '',
    nickname: doc.nickname ?? '',
    displayNameFormat: doc.displayNameFormat ?? '',
    kind: doc.kind ?? '',
    birthday: yearKnown ? partialDateToInput(doc.birthday) : '',
    birthdayYearKnown: yearKnown,
    birthdayMonth: !yearKnown && doc.birthday ? String(Number(doc.birthday.month)) : '',
    birthdayDay: !yearKnown && doc.birthday ? String(Number(doc.birthday.day)) : '',
    notes: doc.notes ?? '',
    pronouns: doc.pronouns ?? '',
  };
}

/** Channels and tags stay null here — ReviseContact UNION-merges them (adds, never removes), so editing
 *  them goes through the wholesale contact.channels / contact.tags ops instead. */
export function contactCoreFromForm(form: ContactForm): EditResult<ContactCore> {
  if (!form.givenName.trim() && !form.familyName.trim() && !form.nickname.trim())
    return { ok: false, error: 'A contact needs at least a name or nickname' };
  return {
    ok: true,
    value: {
      givenName: form.givenName.trim() || null,
      middleName: form.middleName.trim() || null,
      familyName: form.familyName.trim() || null,
      nickname: form.nickname.trim() || null,
      displayNameFormat: form.displayNameFormat || null,
      kind: form.kind || null,
      // null = keep (no REST clear). Year-unknown birthdays come from the month/day fields directly.
      birthday: form.birthdayYearKnown
        ? inputToPartialDate(form.birthday, true)
        : (form.birthdayMonth && form.birthdayDay
          ? { year: null, month: Number(form.birthdayMonth), day: Number(form.birthdayDay) }
          : null),
      notes: form.notes.trim() || null,
      pronouns: form.pronouns.trim() || null,
      channels: null,
      tags: null,
    },
  };
}

export function parseCsv(csv: string): string[] {
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

export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(day: string, time: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

// The device's own zone goes through Date's local arithmetic, so the common case never needs Intl zone data.
function wallOf(iso: string, zone: string): { day: string; time: string } {
  if (zone && zone !== deviceTimeZone()) return instantToWall(iso, zone);
  const d = new Date(iso);
  return { day: localDay(d), time: localTime(d) };
}

function isoOf(day: string, time: string, zone: string): string {
  return zone && zone !== deviceTimeZone() ? wallToInstant(day, time, zone).toISOString() : localToIso(day, time);
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

export function addDaysYmd(day: string, n: number): string {
  return wallFromMs(wallMs(day, '00:00') + n * DAY_MS).day;
}

function daysBetween(from: string, to: string): number {
  return Math.round((wallMs(to, '00:00') - wallMs(from, '00:00')) / DAY_MS);
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
