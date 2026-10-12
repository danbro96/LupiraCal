import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDoc } from '../../domain/docTypes';
import { emptyItemGuards } from '../../domain/docTypes';
import { ITEM_DDL, writeItemIndex } from '../indexes/items';
import { itemHierarchy } from './hierarchy';

let db: Db;

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-09-29T00:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
  await db.exec(ITEM_DDL);
});

afterEach(() => vi.useRealTimers());

const save = (id: string, day: string, fields: Partial<ItemDoc> = {}) =>
  db.exclusive((tx) => writeItemIndex(tx, id, {
    doc: { id, title: id, isAllDay: false, startsAt: `${day}T09:00:00.000Z`, calendars: [{ calendarId: 'cal-a', status: 'Accepted' }], ...fields },
    guards: emptyItemGuards(),
  }));

describe('itemHierarchy', () => {
  it('reads the parent and the direct children earliest first', async () => {
    await save('trip', '2026-10-01');
    await save('hotel', '2026-10-03', { parentItemId: 'trip' });
    await save('flight', '2026-10-01', { parentItemId: 'trip' });
    await save('dinner', '2026-10-02', { parentItemId: 'hotel' });

    const trip = await itemHierarchy(db, 'trip', null);
    expect(trip.parent).toBeNull();
    expect(trip.children.map((r) => [r.id, r.start_utc])).toEqual([
      ['flight', '2026-10-01T09:00:00.000Z'], ['hotel', '2026-10-03T09:00:00.000Z'],
    ]);

    const hotel = await itemHierarchy(db, 'hotel', 'trip');
    expect(hotel.parent).toMatchObject({ id: 'trip', title: 'trip', calendar_id: 'cal-a' });
    expect(hotel.children.map((r) => r.id)).toEqual(['dinner']);
  });

  it('has no parent row for a parent outside the mirror, and drops a child moved elsewhere', async () => {
    await save('child', '2026-10-01', { parentItemId: 'trip' });
    await save('child', '2026-10-01', { parentItemId: null });

    expect(await itemHierarchy(db, 'child', 'gone')).toEqual({ parent: null, children: [] });
    expect((await itemHierarchy(db, 'trip', null)).children).toEqual([]);
  });
});
