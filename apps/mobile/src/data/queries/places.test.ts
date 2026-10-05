import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDoc } from '../../domain/docTypes';
import { emptyItemGuards } from '../../domain/docTypes';
import { ITEM_DDL, writeItemIndex } from '../indexes/items';
import { placedEventsBetween } from './places';

let db: Db;

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-08-01T00:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
  await db.exec(ITEM_DDL);
});

afterEach(() => vi.useRealTimers());

const put = (id: string, placeId: string | null, day: string, over: Partial<ItemDoc> = {}) =>
  db.exclusive((tx) => writeItemIndex(tx, id, {
    doc: {
      id, title: `Item ${id}`, isAllDay: false, placeId, startsAt: `${day}T09:00:00.000Z`,
      calendars: [{ calendarId: 'cal-a', status: 'Accepted' }], ...over,
    },
    guards: emptyItemGuards(),
  }));

describe('placedEventsBetween', () => {
  it('returns placed items in range with the Accepted calendar preferred', async () => {
    await put('a', 'place-1', '2026-08-10', {
      calendars: [{ calendarId: 'cal-z', status: 'Proposed' }, { calendarId: 'cal-a', status: 'Accepted' }],
    });

    expect(await placedEventsBetween(db, '2026-08-01', '2026-08-31')).toEqual([{
      source_id: 'a', start_utc: '2026-08-10T09:00:00.000Z', title: 'Item a', place_id: 'place-1', calendar_id: 'cal-a',
    }]);
  });

  it('keeps only items accepted into a shown calendar when filtered', async () => {
    await put('shown', 'place-1', '2026-08-10');
    await put('hidden', 'place-2', '2026-08-11', { calendars: [{ calendarId: 'cal-b', status: 'Accepted' }] });

    const rows = await placedEventsBetween(db, '2026-08-01', '2026-08-31', { calendarIds: ['cal-a'], birthdays: true });
    expect(rows.map((r) => r.source_id)).toEqual(['shown']);
  });

  it('collapses a recurring item to its earliest occurrence in the window', async () => {
    await put('r', 'place-1', '2026-08-06', { recurrenceRule: 'FREQ=WEEKLY;COUNT=3' });

    const rows = await placedEventsBetween(db, '2026-08-01', '2026-08-31');
    expect(rows).toHaveLength(1);
    expect(rows[0].start_utc).toBe('2026-08-06T09:00:00.000Z');
  });

  it('excludes unplaced items, removed items and occurrences outside the range', async () => {
    await put('unplaced', null, '2026-08-10');
    await put('removed', 'place-2', '2026-08-11');
    await db.exclusive((tx) => writeItemIndex(tx, 'removed', null));
    await put('outside', 'place-3', '2026-09-05');

    expect(await placedEventsBetween(db, '2026-08-01', '2026-08-31')).toEqual([]);
  });
});
