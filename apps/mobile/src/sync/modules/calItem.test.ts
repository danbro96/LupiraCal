import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { ApiError } from '@danbro96/lupira-http/apiError';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { ItemSyncChange } from '@lupira/cal-api/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDoc } from '../../domain/docTypes';
import { emptyItemGuards } from '../../domain/docTypes';
import type { ClientOp, ItemCore } from '../../domain/ops';
import { calItemModule } from './calItem';

const T = (m: number) => `2026-08-01T12:${String(m).padStart(2, '0')}:00.000Z`;
const cmd = (n: number) => `0198c0de-0000-7000-8000-${String(n).padStart(12, '0')}`;
const core = (title: string): ItemCore => ({ title, isAllDay: false, startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T10:00:00.000Z' });
const at = (n: number) => ({ commandId: cmd(n), occurredAt: T(n), aggregate: 'cal.item' as const, aggregateId: 'a' });
const create: ClientOp = { kind: 'item.create', itemId: 'a', sourceKey: 'k', calendarId: 'cal-1', core: core('Picnic'), ...at(1) };
const remove: ClientOp = { kind: 'item.delete', itemId: 'a', ...at(2) };
const revise: ClientOp = { kind: 'item.revise', itemId: 'a', core: core('Mine'), ...at(5) };

const serverChange = (title: string, coreGuard: number): ItemSyncChange => ({
  item: { id: 'a', title, isAllDay: false, startsAt: '2026-08-10T09:00:00.000Z', calendars: [{ calendarId: 'cal-1', status: 'Accepted' }] },
  guards: { ...emptyItemGuards(), core: { ts: T(coreGuard), cmd: cmd(coreGuard) } },
} as unknown as ItemSyncChange);

let db: Db;
const pages: { changed: ItemSyncChange[]; deleted: string[] }[] = [];

// Every replay fails as unreachable, so queued ops stay pending — the state rebase and recompute act on.
const module = {
  ...calItemModule,
  feed: { ...calItemModule.feed, fetch: async () => ({ cursor: 'c', hasMore: false, reset: false, ...pages.shift()! }) },
  replay: async () => {
    throw new ApiError(0, 'offline');
  },
};
const engine = () => createSyncEngine({ openDb: async () => db, modules: [module], cacheVersion: 1, onChange: () => {} });

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-08-01T00:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
});

afterEach(() => vi.useRealTimers());

const titles = () => db.all<{ id: string; title: string }>('SELECT id, title FROM item_index');

describe('calItem module', () => {
  it('indexes an offline create: row, calendars and occurrences', async () => {
    const e = engine();
    await e.enqueue(create);
    await e.push();

    expect(await titles()).toEqual([{ id: 'a', title: 'Picnic' }]);
    expect(await db.all('SELECT calendar_id, status FROM item_calendars')).toEqual([{ calendar_id: 'cal-1', status: 'Accepted' }]);
    expect(await db.all('SELECT start_day FROM item_occurrences')).toEqual([{ start_day: '2026-08-10' }]);
  });

  it('rebases a pulled server doc under a newer pending revise and keeps it across pulls', async () => {
    const e = engine();
    pages.push({ changed: [serverChange('Server', 0)], deleted: [] });
    await e.sync();
    await e.enqueue(revise);
    await e.push();
    pages.push({ changed: [serverChange('Server again', 3)], deleted: [] });
    await e.sync();

    expect((await e.doc<ItemDoc, unknown>('cal.item', 'a'))?.doc.title).toBe('Mine');
    expect(await titles()).toEqual([{ id: 'a', title: 'Mine' }]);
  });

  it('drops a deleted item from every index table', async () => {
    const e = engine();
    pages.push({ changed: [serverChange('Server', 0)], deleted: [] });
    await e.sync();
    await e.enqueue(remove);
    await e.push();

    expect(await e.doc('cal.item', 'a')).toBeNull();
    expect(await titles()).toEqual([]);
    expect(await db.all('SELECT * FROM item_occurrences')).toEqual([]);
    expect(await db.all('SELECT * FROM item_calendars')).toEqual([]);
  });
});
