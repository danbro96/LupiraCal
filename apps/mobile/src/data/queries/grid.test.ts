import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyContactGuards, emptyItemGuards } from '../../domain/docTypes';
import { CALENDAR_DDL, writeCalendarIndex } from '../indexes/calendars';
import { CONTACT_DDL, writeContactIndex } from '../indexes/contacts';
import { ITEM_DDL, writeItemIndex } from '../indexes/items';
import { gridRowsBetween } from './grid';

let db: Db;

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-08-01T00:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
  await db.exec(ITEM_DDL + CONTACT_DDL + CALENDAR_DDL);
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

  it('drops hidden calendars and, when asked, birthdays', async () => {
    const rows = await gridRowsBetween(db, '2026-08-01', '2026-08-31', { calendarIds: ['cal-a'], birthdays: false });
    expect(rows.map((r) => r.source_id)).toEqual(['meet']);
  });
});
