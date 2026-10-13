import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFY_PREFS, notifyPrefsFrom, notifyPrefKey, type NotifyPrefs } from './notificationPrefs';
import {
  birthdayDigests, desiredReminders, eventReminders, leadMinutesFor, morningDigests, type MyOccurrence, type NotifyContext, type ShownOccurrence,
} from './reminders';

const ZONE = 'Europe/Stockholm';
const ctx = (now: string, prefs: Partial<NotifyPrefs> = {}): NotifyContext => ({ now: new Date(now), zone: ZONE, prefs: { ...DEFAULT_NOTIFY_PREFS, ...prefs } });

const timed = (over: Partial<MyOccurrence> = {}): MyOccurrence => ({
  itemId: 'i1', title: 'Dentist', itemStatus: 'Confirmed', place: null, allDay: false,
  startUtc: '2026-10-14T09:00:00.000Z', endUtc: '2026-10-14T10:00:00.000Z', startDay: '2026-10-14',
  rsvp: 'Accepted', reminder: null, ...over,
});
const allDay = (day: string, over: Partial<MyOccurrence> = {}): MyOccurrence => ({
  ...timed(), allDay: true, startUtc: `${day}T00:00:00.000Z`, endUtc: null, startDay: day, ...over,
});

describe('notifyPrefsFrom', () => {
  it('starts every switch on and keeps defaults for missing or unreadable values', () => {
    expect(notifyPrefsFrom({})).toEqual(DEFAULT_NOTIFY_PREFS);
    const prefs = notifyPrefsFrom({
      [notifyPrefKey('birthdays')]: '0', [notifyPrefKey('defaultMinutes')]: '30',
      [notifyPrefKey('morningTime')]: '25:00', [notifyPrefKey('replyLeadMinutes')]: 'x',
    });
    expect([prefs.birthdays, prefs.defaultMinutes, prefs.morningTime, prefs.replyLeadMinutes]).toEqual([false, 30, '07:00', 1440]);
  });
});

describe('leadMinutesFor', () => {
  const prefs = DEFAULT_NOTIFY_PREFS;
  it('takes your own Before over Off over the default', () => {
    expect(leadMinutesFor(timed({ reminder: { mode: 'Before', minutesBefore: 60 } }), prefs)).toBe(60);
    expect(leadMinutesFor(timed({ reminder: { mode: 'Off', minutesBefore: null } }), prefs)).toBeNull();
    expect(leadMinutesFor(timed(), prefs)).toBe(15);
  });

  it('defaults only for timed events you are going to or might', () => {
    expect(leadMinutesFor(timed({ rsvp: 'Tentative' }), prefs)).toBe(15);
    expect(leadMinutesFor(timed({ rsvp: 'NeedsAction' }), prefs)).toBeNull();
    expect(leadMinutesFor(allDay('2026-10-14'), prefs)).toBeNull();
    expect(leadMinutesFor(timed(), { ...prefs, defaultReminder: false })).toBeNull();
  });

  it('drops your own reminders when they are switched off', () => {
    expect(leadMinutesFor(timed({ reminder: { mode: 'Before', minutesBefore: 60 } }), { ...prefs, eventReminders: false })).toBeNull();
  });
});

describe('eventReminders', () => {
  it('fires the lead time before a timed start, keyed per occurrence', () => {
    const [n] = eventReminders([timed({ place: 'Folktandvården' })], ctx('2026-10-13T12:00:00Z'));
    expect(n).toMatchObject({
      id: 'cal:rem:i1:2026-10-14T09:00:00.000Z', fireAt: '2026-10-14T08:45:00.000Z', channel: 'reminders', title: 'Dentist',
      body: 'In 15 min · 11:00 · Folktandvården', data: { url: 'lupiracalendar://item/i1', itemId: 'i1' },
    });
  });

  it('reads longer leads as a day and time', () => {
    const [n] = eventReminders([timed({ reminder: { mode: 'Before', minutesBefore: 1440 } })], ctx('2026-10-12T12:00:00Z'));
    expect([n.fireAt, n.body]).toEqual(['2026-10-13T09:00:00.000Z', 'Tomorrow 11:00']);
  });

  it('skips the past, beyond the horizon, cancelled and declined', () => {
    const now = '2026-10-14T08:50:00Z';
    expect(eventReminders([timed()], ctx(now))).toEqual([]);
    expect(eventReminders([timed({ startUtc: '2026-11-14T09:00:00.000Z' })], ctx('2026-10-13T00:00:00Z'))).toEqual([]);
    expect(eventReminders([timed({ itemStatus: 'Cancelled' }), timed({ rsvp: 'Declined' })], ctx('2026-10-13T00:00:00Z'))).toEqual([]);
  });

  it('counts an all-day reminder back from the morning time on the wall clock across DST', () => {
    const before = (minutesBefore: number) => ({ reminder: { mode: 'Before' as const, minutesBefore } });
    const now = '2026-10-20T00:00:00Z';
    // 25 Oct: CEST → CET at 03:00. 07:00 on the 25th is 06:00Z, on the 24th 05:00Z.
    expect(eventReminders([allDay('2026-10-25', before(0))], ctx(now))[0].fireAt).toBe('2026-10-25T06:00:00.000Z');
    expect(eventReminders([allDay('2026-10-26', before(1440))], ctx(now))[0].fireAt).toBe('2026-10-25T06:00:00.000Z');
    expect(eventReminders([allDay('2026-10-25', before(1440))], ctx(now))[0].fireAt).toBe('2026-10-24T05:00:00.000Z');
    expect(eventReminders([allDay('2026-10-25', before(1440))], ctx(now))[0].body).toBe('Tomorrow · All day');
  });

  it('keeps the morning time across the spring change too', () => {
    const [n] = eventReminders([allDay('2026-03-29', { reminder: { mode: 'Before', minutesBefore: 60 } })], ctx('2026-03-20T00:00:00Z'));
    expect(n.fireAt).toBe('2026-03-29T04:00:00.000Z');
  });
});

describe('morningDigests', () => {
  const shown = (over: Partial<ShownOccurrence>): ShownOccurrence => ({
    itemId: 'x', title: 'X', itemStatus: null, allDay: false, startUtc: '2026-10-14T09:00:00.000Z', endUtc: null, startDay: '2026-10-14', rsvp: null, ...over,
  });

  it('lists one day per digest at the morning time, ongoing trips first with their day count', () => {
    const digests = morningDigests([
      shown({ itemId: 'lunch', title: 'Lunch', startUtc: '2026-10-14T10:30:00.000Z', endUtc: '2026-10-14T11:30:00.000Z' }),
      shown({ itemId: 'oslo', title: 'Oslo', allDay: true, startUtc: '2026-10-13T00:00:00.000Z', endUtc: '2026-10-15T00:00:00.000Z', startDay: '2026-10-13' }),
      shown({ itemId: 'flag', title: 'Flag day', allDay: true, startUtc: '2026-10-14T00:00:00.000Z', startDay: '2026-10-14' }),
    ], ctx('2026-10-13T12:00:00Z'));

    expect(digests.map((d) => [d.id, d.fireAt])).toEqual([
      ['cal:day:2026-10-14', '2026-10-14T05:00:00.000Z'],
      ['cal:day:2026-10-15', '2026-10-15T05:00:00.000Z'],
    ]);
    expect(digests[0]).toMatchObject({ channel: 'daily', title: 'Today', body: 'Oslo · day 2 of 3\nFlag day\n12:30 Lunch' });
    expect(digests[1].body).toBe('Oslo · day 3 of 3');
  });

  it('leaves out cancelled and declined events, and days with nothing on', () => {
    expect(morningDigests([shown({ itemStatus: 'Cancelled' }), shown({ rsvp: 'Declined' })], ctx('2026-10-13T12:00:00Z'))).toEqual([]);
  });

  it('places a timed event on its wall-clock day in the zone', () => {
    const [d] = morningDigests([shown({ title: 'Late', startUtc: '2026-10-14T22:30:00.000Z' })], ctx('2026-10-13T12:00:00Z'));
    expect([d.id, d.body]).toEqual(['cal:day:2026-10-15', '00:30 Late']);
  });

  it('fires after a DST change at 07:00 local', () => {
    const [d] = morningDigests([shown({ allDay: true, startUtc: '2026-10-26T00:00:00.000Z', startDay: '2026-10-26' })], ctx('2026-10-24T12:00:00Z'));
    expect(d.fireAt).toBe('2026-10-26T06:00:00.000Z');
  });
});

describe('birthdayDigests', () => {
  it('sends one digest per day with ages where the year is known', () => {
    const now = '2026-10-13T12:00:00Z';
    const [one, many] = birthdayDigests([
      { contactId: 'a', name: 'Anna', day: '2026-10-14', birthYear: 1986 },
      { contactId: 'b', name: 'Bo', day: '2026-10-15', birthYear: null },
      { contactId: 'c', name: 'Cia', day: '2026-10-15', birthYear: 2000 },
    ], ctx(now));
    expect(one).toMatchObject({ id: 'cal:bday:2026-10-14', fireAt: '2026-10-14T07:00:00.000Z', title: 'Anna’s birthday', body: 'Turns 40 today', data: { url: 'lupiracalendar://contact/a' } });
    expect(many).toMatchObject({ id: 'cal:bday:2026-10-15', title: '2 birthdays today', body: 'Bo\nCia · 26' });
  });
});

describe('desiredReminders', () => {
  it('honours the summary switches', () => {
    const sources = {
      mine: [],
      shown: [{ itemId: 'x', title: 'X', itemStatus: null, allDay: true, startUtc: '2026-10-14T00:00:00.000Z', endUtc: null, startDay: '2026-10-14', rsvp: null }],
      birthdays: [{ contactId: 'a', name: 'Anna', day: '2026-10-14', birthYear: null }],
    };
    expect(desiredReminders(sources, ctx('2026-10-13T12:00:00Z')).map((n) => n.id)).toEqual(['cal:day:2026-10-14', 'cal:bday:2026-10-14']);
    expect(desiredReminders(sources, ctx('2026-10-13T12:00:00Z', { morningSummary: false, birthdays: false }))).toEqual([]);
  });
});
