import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDoc } from '../../domain/docTypes';
import { emptyItemGuards } from '../../domain/docTypes';
import { ITEM_DDL, writeItemIndex } from '../indexes/items';
import { placeUsageUpTo } from './placeUsage';

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

describe('placeUsageUpTo', () => {
  it('counts each occurrence up to today, by category, with the attendees who came', async () => {
    await put('dinner', 'place-1', '2026-07-01', {
      category: 'Meal', locationLabel: 'Mormor', recurrenceRule: 'FREQ=WEEKLY;COUNT=10',
      attendees: [
        { participationId: 'p1', contactId: 'anna', role: 'RequiredParticipant', status: 'Accepted' },
        { participationId: 'p2', contactId: 'erik', role: 'RequiredParticipant', status: 'Declined' },
      ],
    });
    await put('gym', 'place-1', '2026-07-20', { category: 'Activity' });

    expect(await placeUsageUpTo(db, '2026-07-31')).toEqual([{
      placeId: 'place-1',
      label: 'Mormor',
      eventCount: 6,
      lastDay: '2026-07-29',
      byCategory: [
        { category: 'Meal', eventCount: 5, lastDay: '2026-07-29' },
        { category: 'Activity', eventCount: 1, lastDay: '2026-07-20' },
      ],
      companions: [{ contactId: 'anna', eventCount: 5 }],
    }]);
  });

  it('leaves out cancelled, unaccepted, unplaced and future events', async () => {
    await put('cancelled', 'place-1', '2026-07-01', { status: 'Cancelled' });
    await put('proposed', 'place-2', '2026-07-02', { calendars: [{ calendarId: 'cal-a', status: 'Proposed' }] });
    await put('unplaced', null, '2026-07-03');
    await put('future', 'place-3', '2026-08-10');

    expect(await placeUsageUpTo(db, '2026-07-31')).toEqual([]);
  });
});
