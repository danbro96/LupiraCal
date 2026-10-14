import { lastDayOf } from '@lupira/cal-domain/occurrences';
import { fromWallMs, instantToWall } from '@lupira/cal-domain/zonedTime';
import type { ParticipantReminder } from './docTypes';
import type { DesiredNotification } from './notificationPlan';
import type { NotifyPrefs } from './notificationPrefs';

/** Which reminders and daily summaries this device should hold. Pure: the zone is explicit, so a day's 07:00 is
 *  that wall clock on either side of a DST change. */

export type NotifyContext = { now: Date; zone: string; prefs: NotifyPrefs };

/** One occurrence of an item you're on, with your RSVP and your own reminder. `originalStart` names it in its
 *  series (null for a one-off item); title and status are the occurrence's own. */
export type MyOccurrence = {
  itemId: string;
  originalStart: string | null;
  title: string | null;
  itemStatus: string | null;
  place: string | null;
  allDay: boolean;
  startUtc: string;
  endUtc: string | null;
  startDay: string;
  rsvp: string;
  reminder: ParticipantReminder | null;
};

/** One occurrence in a shown calendar; `rsvp` is yours, null when you're not on it. */
export type ShownOccurrence = {
  itemId: string;
  title: string | null;
  itemStatus: string | null;
  allDay: boolean;
  startUtc: string;
  endUtc: string | null;
  startDay: string;
  rsvp: string | null;
};

export type BirthdayOccurrence = { contactId: string; name: string; day: string; birthYear: number | null };

export const HORIZON_DAYS = 14;
export const UNTITLED = 'Untitled event';
const MINUTE = 60_000;
const DAY = 86_400_000;

export const itemUrl = (itemId: string, occurrence?: string | null) =>
  `lupiracalendar://item/${itemId}${occurrence ? `?occ=${occurrence}` : ''}`;
export const contactUrl = (contactId: string) => `lupiracalendar://contact/${contactId}`;
const APP_URL = 'lupiracalendar://';

export function addDays(day: string, n: number): string {
  return new Date(dayMs(day) + n * DAY).toISOString().slice(0, 10);
}

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const daysBetween = (from: string, to: string) => Math.round((dayMs(to) - dayMs(from)) / DAY);

export const todayIn = (now: Date, zone: string) => instantToWall(now.toISOString(), zone).day;

/** The instant `day` shows `time` in `zone`, moved earlier by `minutesBefore` on the wall clock. */
export function wallFire(day: string, time: string, zone: string, minutesBefore = 0): number {
  return fromWallMs(dayMs(day) + (minutesOf(time) - minutesBefore) * MINUTE, zone);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `day` as read on `refDay`: "Today", "Tomorrow", or "Tue 14 Oct". */
export function dayLabel(day: string, refDay: string): string {
  const diff = daysBetween(refDay, day);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const d = new Date(dayMs(day));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** When an occurrence starts, read on the day `at` falls in. */
export function whenLabel(o: { allDay: boolean; startUtc: string; startDay: string }, at: number, zone: string): string {
  const ref = instantToWall(new Date(at).toISOString(), zone).day;
  if (o.allDay) return `${dayLabel(o.startDay, ref)} · All day`;
  const start = instantToWall(o.startUtc, zone);
  return `${dayLabel(start.day, ref)} ${start.time}`;
}

/** Your own Before wins, Off silences, and the default covers only timed events you're going to or might. */
export function leadMinutesFor(o: Pick<MyOccurrence, 'allDay' | 'rsvp' | 'reminder'>, prefs: NotifyPrefs): number | null {
  const mode = o.reminder?.mode ?? 'Default';
  if (mode === 'Before') return prefs.eventReminders ? (o.reminder?.minutesBefore ?? 0) : null;
  if (mode === 'Off') return null;
  return prefs.defaultReminder && !o.allDay && (o.rsvp === 'Accepted' || o.rsvp === 'Tentative') ? prefs.defaultMinutes : null;
}

const silenced = (o: { itemStatus: string | null; rsvp: string | null }) => o.itemStatus === 'Cancelled' || o.rsvp === 'Declined';

/** Per-occurrence reminders; an all-day one counts back from the morning time. */
export function eventReminders(mine: readonly MyOccurrence[], { now, zone, prefs }: NotifyContext): DesiredNotification[] {
  const until = now.getTime() + HORIZON_DAYS * DAY;
  const out: DesiredNotification[] = [];
  for (const o of mine) {
    if (silenced(o)) continue;
    const minutes = leadMinutesFor(o, prefs);
    if (minutes === null) continue;
    const fire = o.allDay ? wallFire(o.startDay, prefs.morningTime, zone, minutes) : Date.parse(o.startUtc) - minutes * MINUTE;
    if (fire <= now.getTime() || fire > until) continue;
    const lead = Math.round((Date.parse(o.startUtc) - fire) / MINUTE);
    const when = !o.allDay && lead < 60
      ? `${lead === 0 ? 'Now' : `In ${lead} min`} · ${instantToWall(o.startUtc, zone).time}`
      : whenLabel(o, fire, zone);
    out.push({
      id: `cal:rem:${o.itemId}:${o.startUtc}`,
      fireAt: new Date(fire).toISOString(),
      channel: 'reminders',
      title: o.title || UNTITLED,
      body: o.place ? `${when} · ${o.place}` : when,
      data: { url: itemUrl(o.itemId, o.originalStart), itemId: o.itemId },
    });
  }
  return out;
}

/** The days a digest may fire on: today through the horizon, in `zone`. */
export function horizonDays(now: Date, zone: string): string[] {
  const today = todayIn(now, zone);
  return Array.from({ length: HORIZON_DAYS + 1 }, (_, i) => addDays(today, i));
}

/** First and last wall-clock day an occurrence covers in `zone`. */
function spanOf(o: ShownOccurrence, zone: string): { first: string; last: string } {
  if (o.allDay) return { first: o.startDay, last: lastDayOf(o.startDay, o.endUtc, true) };
  const first = instantToWall(o.startUtc, zone).day;
  const end = o.endUtc ? Date.parse(o.endUtc) - 1 : null;
  const last = end !== null && end > Date.parse(o.startUtc) ? instantToWall(new Date(end).toISOString(), zone).day : first;
  return { first, last };
}

/** One summary per day of what's on it, multi-day trips and stays included with how far in they are. */
export function morningDigests(shown: readonly ShownOccurrence[], { now, zone, prefs }: NotifyContext): DesiredNotification[] {
  const spans = shown.filter((o) => !silenced(o)).map((o) => ({ o, ...spanOf(o, zone) }));
  const out: DesiredNotification[] = [];
  for (const day of horizonDays(now, zone)) {
    const fire = wallFire(day, prefs.morningTime, zone);
    if (fire <= now.getTime()) continue;
    const lines = spans
      .filter((s) => s.first <= day && day <= s.last)
      .map((s) => {
        const title = s.o.title || UNTITLED;
        const length = daysBetween(s.first, s.last) + 1;
        if (length > 1) return { order: `0${s.first}${s.o.startUtc}`, text: `${title} · day ${daysBetween(s.first, day) + 1} of ${length}` };
        if (s.o.allDay) return { order: `1${s.o.startUtc}`, text: title };
        return { order: `2${s.o.startUtc}`, text: `${instantToWall(s.o.startUtc, zone).time} ${title}` };
      })
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    if (lines.length === 0) continue;
    out.push({
      id: `cal:day:${day}`,
      fireAt: new Date(fire).toISOString(),
      channel: 'daily',
      title: 'Today',
      body: lines.map((l) => l.text).join('\n'),
      data: { url: APP_URL },
    });
  }
  return out;
}

export function birthdayDigests(birthdays: readonly BirthdayOccurrence[], { now, zone, prefs }: NotifyContext): DesiredNotification[] {
  const out: DesiredNotification[] = [];
  for (const day of horizonDays(now, zone)) {
    const fire = wallFire(day, prefs.birthdayTime, zone);
    const on = birthdays.filter((b) => b.day === day).sort((a, b) => a.name.localeCompare(b.name));
    if (fire <= now.getTime() || on.length === 0) continue;
    const age = (b: BirthdayOccurrence) => (b.birthYear ? Number(day.slice(0, 4)) - b.birthYear : null);
    const single = on.length === 1 ? on[0] : null;
    out.push({
      id: `cal:bday:${day}`,
      fireAt: new Date(fire).toISOString(),
      channel: 'daily',
      title: single ? `${single.name}’s birthday` : `${on.length} birthdays today`,
      body: single
        ? (age(single) ? `Turns ${age(single)} today` : 'Today')
        : on.map((b) => (age(b) ? `${b.name} · ${age(b)}` : b.name)).join('\n'),
      data: { url: single ? contactUrl(single.contactId) : APP_URL },
    });
  }
  return out;
}

export function desiredReminders(
  sources: { mine: readonly MyOccurrence[]; shown: readonly ShownOccurrence[]; birthdays: readonly BirthdayOccurrence[] },
  ctx: NotifyContext,
): DesiredNotification[] {
  return [
    ...eventReminders(sources.mine, ctx),
    ...(ctx.prefs.morningSummary ? morningDigests(sources.shown, ctx) : []),
    ...(ctx.prefs.birthdays ? birthdayDigests(sources.birthdays, ctx) : []),
  ];
}
