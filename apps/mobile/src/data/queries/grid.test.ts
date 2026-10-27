import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyContactGuards, emptyItemGuards } from '../../domain/docTypes';
import { CALENDAR_DDL, writeCalendarIndex } from '../indexes/calendars';
import { CONTACT_DDL, writeContactIndex } from '../indexes/contacts';
import { ITEM_DDL, writeItemIndex } from '../indexes/items';
import { SUBSCRIBED_DDL, writeSubscribedIndex } from '../indexes/subscriptions';
import { gridRowsBetween } from './grid';

let db: Db;

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-08-01T00:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
  await db.exec(ITEM_DDL + CONTACT_DDL + CALENDAR_DDL + SUBSCRIBED_DDL);
  await db.exclusive(async (tx) => {
    await writeCalendarIndex(tx, 'away', { doc: { kind: 'Availability' } });
    await writeItemIndex(tx, 'meet', {
      doc: { id: 'meet', title: 'Meeting', isAllDay: false, startsAt: '2026-08-10T09:00:00.000Z', calendars: [{ calendarId: 'cal-a', status: 'Accepted' }] },
      guards: emptyItemGuards(),
    });
    await writeItemIndex(tx, 'trip', {
      doc: {
        id: 'trip', title: 'Trip', isAllDay: true, startDate: '2026-08-12', endDate: '2026-08-14',
        details: { presence: { status: 'Vacation' } }, calendars: [{ calendarId: 'away', status: 'Accepted' }],
      },
      guards: emptyItemGuards(),
    });
    await writeContactIndex(tx, 'anna', {
      doc: { id: 'anna', addressBookId: 'ab', givenName: 'Anna', birthday: { year: 1990, month: 8, day: 11 } },
      guards: emptyContactGuards(),
    });
  });
});

afterEach(() => vi.useRealTimers());

describe('gridRowsBetween', () => {
  it('merges item occurrences and birthdays in start order, with availability flagged', async () => {
    const rows = await gridRowsBetween(db, '2026-08-01', '2026-08-31');
    expect(rows.map((r) => [r.source, r.source_id, r.title, r.calendar_id, r.is_availability, r.avail_status])).toEqual([
      ['item', 'meet', 'Meeting', 'cal-a', null, null],
      ['birthday', 'anna', 'Anna', null, null, null],
      ['item', 'trip', 'Trip', 'away', 1, 'Vacation'],
    ]);
  });

  it('reads a changed occurrence under its own title and status, keyed by its series start', async () => {
    await db.exclusive((tx) => writeItemIndex(tx, 'weekly', {
      doc: {
        id: 'weekly', title: 'Training', status: 'Confirmed', isAllDay: false, startsAt: '2026-08-03T17:00:00.000Z', recurrenceRule: 'FREQ=WEEKLY;COUNT=2',
        occurrenceOverrides: [{ originalStart: '2026-08-10T17:00:00Z', startsAt: '2026-08-11T17:00:00Z', endsAt: null, title: 'Match', description: null, status: 'Tentative', locationLabel: null }],
        calendars: [{ calendarId: 'cal-a', status: 'Accepted' }],
      },
      guards: emptyItemGuards(),
    }));
    const rows = (await gridRowsBetween(db, '2026-08-01', '2026-08-31')).filter((r) => r.source_id === 'weekly');
    expect(rows.map((r) => [r.original_start, r.start_day, r.title, r.status])).toEqual([
      ['2026-08-03T17:00:00Z', '2026-08-03', 'Training', 'Confirmed'],
      ['2026-08-10T17:00:00Z', '2026-08-11', 'Match', 'Tentative'],
    ]);
  });

  it('carries the item\'s own colour; birthdays and uncoloured items have none', async () => {
    await db.exclusive((tx) => writeItemIndex(tx, 'meet', {
      doc: { id: 'meet', title: 'Meeting', isAllDay: false, startsAt: '2026-08-10T09:00:00.000Z', color: 'Red', calendars: [{ calendarId: 'cal-a', status: 'Accepted' }] },
      guards: emptyItemGuards(),
    }));
    const rows = await gridRowsBetween(db, '2026-08-01', '2026-08-31');
    expect(rows.map((r) => [r.source_id, r.color])).toEqual([['meet', 'Red'], ['anna', null], ['trip', null]]);
  });

  it('drops hidden calendars and, when asked, birthdays', async () => {
    const rows = await gridRowsBetween(db, '2026-08-01', '2026-08-31', { calendarIds: ['cal-a'], birthdays: false });
    expect(rows.map((r) => r.source_id)).toEqual(['meet']);
  });

  it('draws a multi-calendar item once, under its lowest-id shown calendar', async () => {
    await db.exclusive((tx) => writeItemIndex(tx, 'meet', {
      doc: {
        id: 'meet', title: 'Meeting', isAllDay: false, startsAt: '2026-08-10T09:00:00.000Z',
        calendars: [{ calendarId: 'cal-a', status: 'Accepted' }, { calendarId: 'cal-c', status: 'Accepted' }, { calendarId: 'cal-b', status: 'Accepted' }],
      },
      guards: emptyItemGuards(),
    }));
    const rows = await gridRowsBetween(db, '2026-08-01', '2026-08-31', { calendarIds: ['cal-b', 'cal-c'], birthdays: false });
    expect(rows.map((r) => [r.source_id, r.calendar_id])).toEqual([['meet', 'cal-b']]);
  });

  it('merges subscribed occurrences under their calendar and the subscription\'s colour', async () => {
    await db.exclusive((tx) => writeSubscribedIndex(tx, 'match', subscribed('match', 'sub-a', 'cal-a')));
    const rows = (await gridRowsBetween(db, '2026-08-01', '2026-08-31')).filter((r) => r.source === 'subscribed');
    expect(rows.map((r) => [r.source_id, r.original_start, r.start_day, r.title, r.status, r.calendar_id, r.color, r.is_availability])).toEqual([
      ['match', '2026-08-04T16:00:00Z', '2026-08-04', 'Match', 'Confirmed', 'cal-a', 'Teal', null],
      ['match', '2026-08-11T16:00:00Z', '2026-08-11', 'Match', 'Confirmed', 'cal-a', 'Teal', null],
    ]);
  });

  it('drops subscribed events of hidden calendars and of subscriptions hidden on the device', async () => {
    await db.exclusive(async (tx) => {
      await writeSubscribedIndex(tx, 'match', subscribed('match', 'sub-a', 'cal-a'));
      await writeSubscribedIndex(tx, 'holiday', subscribed('holiday', 'sub-b', 'cal-a'));
      await writeSubscribedIndex(tx, 'other', subscribed('other', 'sub-c', 'cal-b'));
    });
    const sources = async (hidden: string[]) =>
      [...new Set((await gridRowsBetween(db, '2026-08-01', '2026-08-31', { calendarIds: ['cal-a'], birthdays: true }, hidden))
        .filter((r) => r.source === 'subscribed').map((r) => r.source_id))].sort();
    expect(await sources([])).toEqual(['holiday', 'match']);
    expect(await sources(['sub-a'])).toEqual(['holiday']);
  });
});

const subscribed = (id: string, subscriptionId: string, calendarId: string) => ({
  doc: {
    id, subscriptionId, calendarId, title: 'Match', isAllDay: false, status: 'Confirmed', color: 'Teal',
    occurrences: [
      { start: '2026-08-04T16:00:00Z', end: '2026-08-04T18:00:00Z', originalStart: '2026-08-04T16:00:00Z' },
      { start: '2026-08-11T16:00:00Z', end: '2026-08-11T18:00:00Z', originalStart: '2026-08-11T16:00:00Z' },
    ],
  },
});
