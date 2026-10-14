import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { ApiError } from '@danbro96/lupira-http/apiError';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { ItemSyncChange } from '@lupira/cal-api/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lineageRoot } from '../../data/queries/itemLineage';
import type { ItemDoc, ItemGuards } from '../../domain/docTypes';
import { emptyItemGuards } from '../../domain/docTypes';
import { continuationOf } from '../../domain/mirrorReducers';
import type { ClientOp, ItemCore } from '../../domain/ops';
import { withHoldKeys } from '../holdKeys';
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

  it('keeps occurrence identities as keys and indexes the series as it deviates', async () => {
    const e = engine();
    const change = serverChange('Weekly', 0);
    Object.assign(change.item, {
      recurrenceRule: 'FREQ=WEEKLY;COUNT=3',
      excludedOccurrences: ['2026-08-17T11:00:00+02:00'],
      occurrenceOverrides: [{ originalStart: '2026-08-24T09:00:00+00:00', startsAt: '2026-08-24T12:00:00Z', endsAt: null, title: 'Moved', description: null, status: null, locationLabel: null }],
    });
    pages.push({ changed: [change], deleted: [] });
    await e.sync();

    const doc = (await e.doc<ItemDoc, unknown>('cal.item', 'a'))!.doc;
    expect(doc.excludedOccurrences).toEqual(['2026-08-17T09:00:00Z']);
    expect(doc.occurrenceOverrides?.[0].originalStart).toBe('2026-08-24T09:00:00Z');
    expect(await db.all('SELECT original_start, start_utc, title FROM item_occurrences ORDER BY start_utc')).toEqual([
      { original_start: '2026-08-10T09:00:00Z', start_utc: '2026-08-10T09:00:00.000Z', title: null },
      { original_start: '2026-08-24T09:00:00Z', start_utc: '2026-08-24T12:00:00.000Z', title: 'Moved' },
    ]);
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

describe('this and following, offline', () => {
  const replayed: string[] = [];
  let failWith: ((op: ClientOp) => ApiError | null) | null = null;
  const splitModule = {
    ...calItemModule,
    feed: { ...calItemModule.feed, fetch: async () => ({ cursor: 'c', hasMore: false, reset: false, ...pages.shift()! }) },
    replay: async (op: ClientOp) => {
      const failure = failWith?.(op);
      if (failure) throw failure;
      replayed.push(`${op.kind}:${op.aggregateId}`);
    },
  };
  const splitEngine = () => createSyncEngine({ openDb: async () => db, modules: [splitModule], cacheVersion: 1, onChange: () => {} });

  const weekly = (rule: string, id = 'a'): ItemSyncChange => ({
    item: {
      id, title: 'Training', isAllDay: false, startsAt: '2026-08-10T09:00:00.000Z', endsAt: '2026-08-10T10:00:00.000Z',
      recurrenceRule: rule, calendars: [{ calendarId: 'cal-1', status: 'Accepted' }],
    },
    guards: emptyItemGuards(),
  } as unknown as ItemSyncChange);

  const occurrences = (id: string) => db.all<{ original_start: string }>('SELECT original_start FROM item_occurrences WHERE item_id = ? ORDER BY start_utc', [id]);

  async function splitAt(e: ReturnType<typeof splitEngine>, originalStart: string, core: ItemCore): Promise<ClientOp[]> {
    const state = (await e.doc<ItemDoc, ItemGuards>('cal.item', 'a'))!;
    const holdKey = await lineageRoot(db, 'a');
    const split: ClientOp = { kind: 'item.split', itemId: 'a', originalStart, newItemId: 'b', sourceKey: 'k', core, ...at(10), holdKey };
    const continuation = continuationOf(state, 'b', originalStart, core, { ts: split.occurredAt, cmd: split.commandId })!;
    const ops: ClientOp[] = [split, { kind: 'item.continue', itemId: 'b', continuesItemId: 'a', state: continuation, ...at(11), aggregateId: 'b', holdKey }];
    await e.enqueue(ops);
    return ops;
  }

  const following: ItemCore = {
    title: 'Later', isAllDay: false, startsAt: '2026-08-17T09:00:00.000Z', endsAt: '2026-08-17T10:00:00.000Z', recurrenceRule: 'FREQ=WEEKLY;COUNT=3',
  };

  beforeEach(() => {
    replayed.length = 0;
    failWith = null;
  });

  it('shows both series offline, holds the new series\' edits behind the split, and converges once it lands', async () => {
    const e = splitEngine();
    pages.push({ changed: [weekly('FREQ=WEEKLY;COUNT=4')], deleted: [] });
    await e.sync();
    failWith = (op) => (op.kind === 'item.split' ? new ApiError(503, 'down') : null);
    await splitAt(e, '2026-08-17T09:00:00Z', following);

    expect(await occurrences('a')).toEqual([{ original_start: '2026-08-10T09:00:00Z' }]);
    expect((await occurrences('b')).map((o) => o.original_start)).toEqual(['2026-08-17T09:00:00Z', '2026-08-24T09:00:00Z', '2026-08-31T09:00:00Z']);
    expect(await lineageRoot(db, 'b')).toBe('a');

    const [rename] = await withHoldKeys(db, [{ kind: 'item.revise', itemId: 'b', core: { ...following, title: 'Renamed' }, ...at(12), aggregateId: 'b' }]);
    expect(rename.holdKey).toBe('a');
    await e.enqueue(rename);
    await e.push();
    expect(replayed).toEqual([]);

    failWith = null;
    vi.setSystemTime(new Date('2026-08-02T00:00:00Z'));
    await e.push();
    expect(replayed).toEqual(['item.split:a', 'item.continue:b', 'item.revise:b']);

    pages.push({ changed: [weekly('FREQ=WEEKLY;COUNT=1'), { ...weekly('FREQ=WEEKLY;COUNT=3', 'b'), item: { ...weekly('FREQ=WEEKLY;COUNT=3', 'b').item, title: 'Renamed', startsAt: '2026-08-17T09:00:00.000Z' } } as unknown as ItemSyncChange], deleted: [] });
    await e.sync();
    expect((await e.doc<ItemDoc, unknown>('cal.item', 'b'))?.doc.title).toBe('Renamed');
    expect(await lineageRoot(db, 'b')).toBe('b');
    expect(await occurrences('a')).toEqual([{ original_start: '2026-08-10T09:00:00Z' }]);
  });

  it('a discarded split leaves the series whole, and its continuation parks for discarding too', async () => {
    const e = splitEngine();
    pages.push({ changed: [weekly('FREQ=WEEKLY;COUNT=4')], deleted: [] });
    await e.sync();
    failWith = (op) => (op.kind === 'item.split' ? new ApiError(409, 'stale') : op.kind === 'item.continue' ? new ApiError(404, 'gone') : null);
    const [split, continuation] = await splitAt(e, '2026-08-17T09:00:00Z', following);
    await e.push();
    expect((await e.parked()).map((p) => p.op.kind)).toEqual(['item.split']);

    await e.discard(split.commandId);
    await e.push();
    expect((await occurrences('a'))).toHaveLength(4);
    expect((await e.parked()).map((p) => p.op.kind)).toEqual(['item.continue']);

    await e.discard(continuation.commandId);
    expect(await e.doc('cal.item', 'b')).toBeNull();
    expect(await occurrences('b')).toEqual([]);
  });
});
