import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openNodeDb } from '../data/db/nodeDb';
import { MIGRATIONS, migrate } from '../data/db/schema';
import type { Db } from '../data/db/types';
import * as mirror from '../data/mirror';
import { ApiError } from '../domain/apiError';
import { PARK_AFTER_ATTEMPTS } from '../domain/backoff';
import type { ItemDoc, ItemGuards } from '../domain/docTypes';
import { emptyItemGuards } from '../domain/docTypes';
import type { Horizon } from '../domain/materialize';
import type { ClientOp } from '../domain/ops';
import { drain, enqueue } from './outbox';
import type { ChangesPage, ContactChange, ItemChange, PullDeps } from './pull';
import { pullCal, pullContainers, pullContacts } from './pull';

vi.mock('../debug/log', () => ({ logDebug: vi.fn() }));

/** The whole engine under node:sqlite — enqueue/drain (backoff, park, causal hold), the delta/full pull with
 *  rebase-through-pending-ops, tombstones, prune, and cursor plumbing. Every scenario here is a defect class
 *  from LupiraTasksMobile that must stay dead. */

const horizon: Horizon = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2027-01-01T00:00:00Z') };
const T = (m: number) => `2026-07-01T12:${String(m).padStart(2, '0')}:00.000Z`;
const cmd = (n: number) => `0198c0de-0000-7000-8000-${String(n).padStart(12, '0')}`;

let db: Db;

beforeEach(async () => {
  db = openNodeDb();
  await migrate(db);
});

const createOp = (itemId: string, n: number, calendarId = 'cal-1'): ClientOp => ({
  kind: 'item.create', itemId, sourceKey: `${itemId}@key`, calendarId,
  occurredAt: T(n), commandId: cmd(n),
  core: { title: `Item ${itemId}`, isAllDay: false, startsAt: '2026-08-01T09:00:00Z', endsAt: '2026-08-01T10:00:00Z' },
});

const reviseOp = (itemId: string, title: string, n: number): ClientOp => ({
  kind: 'item.revise', itemId, occurredAt: T(n), commandId: cmd(n),
  core: { title, isAllDay: false, startsAt: '2026-08-01T09:00:00Z', endsAt: '2026-08-01T10:00:00Z' },
});

const serverItem = (id: string, over: Partial<ItemDoc> = {}): ItemDoc => ({
  id, title: 'Server title', isAllDay: false, startsAt: '2026-08-01T09:00:00Z', endsAt: '2026-08-01T10:00:00Z',
  calendars: [{ calendarId: 'cal-1', status: 'Accepted' }], updatedAt: T(0), ...over,
});

const serverGuards = (over: Partial<ItemGuards> = {}): ItemGuards => ({ ...emptyItemGuards(), ...over });

/** Enqueue while "offline": the auto-drain hits an unreachable server, so the op STAYS pending — the state
 *  every rebase/prune/migration scenario needs (a no-op replay would ack and delete it immediately). */
async function enqueueOffline(ops: ClientOp[]): Promise<void> {
  const deps = {
    replay: async () => {
      throw new ApiError(0, 'offline');
    },
    now: () => new Date('2026-07-01T13:00:00Z'),
    rand: () => 0.5,
  };
  await enqueue(db, ops, horizon, deps);
  await drain(db, deps);   // joins the enqueue-triggered drain so the failure is settled before asserting
}

type PageIn<T> = Omit<ChangesPage<T>, 'reset'> & { reset?: boolean };
const withReset = <T>(p: PageIn<T>): ChangesPage<T> => ({ reset: false, ...p });

function pagesDeps(calPages: PageIn<ItemChange>[], contactPages: PageIn<ContactChange>[] = []): PullDeps & { calCalls: (string | null)[] } {
  const calCalls: (string | null)[] = [];
  let calIdx = 0;
  let contactIdx = 0;
  return {
    calCalls,
    calChanges: async (since) => {
      calCalls.push(since);
      return withReset(calPages[Math.min(calIdx++, calPages.length - 1)]);
    },
    contactChanges: async () =>
      withReset(contactPages[Math.min(contactIdx++, Math.max(contactPages.length - 1, 0))]
        ?? { cursor: '0', hasMore: false, changed: [], deleted: [] }),
    calContainers: async () => [{ id: 'cal-1' }],
    contactContainers: async () => ({ addressBooks: [{ id: 'book-1', slug: 'personal' }], groups: [] }),
    now: () => new Date('2026-07-01T13:00:00Z'),
  };
}

describe('outbox', () => {
  it('enqueue writes the optimistic row, its occurrences, and the outbox entry atomically', async () => {
    await enqueue(db, [createOp('item-1', 1)], horizon, { replay: async () => {} });
    await drain(db, { replay: async () => {} });

    const item = await mirror.loadItem(db, 'item-1');
    expect(item?.doc.title).toBe('Item item-1');
    const occ = await mirror.occurrencesBetween(db, '2026-08-01', '2026-08-01');
    expect(occ).toHaveLength(1);
  });

  it('drains in order and deletes acked ops', async () => {
    const replayed: string[] = [];
    const replay = async (op: ClientOp) => {
      replayed.push(op.commandId);
    };
    await enqueue(db, [createOp('item-1', 1), reviseOp('item-1', 'v2', 2)], horizon, { replay });
    await drain(db, { replay });

    expect(replayed).toEqual([cmd(1), cmd(2)]);
    expect(await mirror.outboxCounts(db)).toEqual({ pending: 0, parked: 0 });
  });

  it('a transient failure earns backoff — not retried until due, retried after', async () => {
    let now = new Date('2026-07-01T13:00:00Z');
    let calls = 0;
    const replay = async () => {
      calls++;
      if (calls === 1) throw new ApiError(503, 'down');
    };
    const deps = { replay, now: () => now, rand: () => 0.5 };

    await enqueue(db, [createOp('item-1', 1)], horizon, deps);
    await drain(db, deps);
    expect(calls).toBe(1);
    expect(await mirror.outboxCounts(db)).toEqual({ pending: 1, parked: 0 });

    await drain(db, deps);   // still inside the backoff window
    expect(calls).toBe(1);

    now = new Date(now.getTime() + 60_000);
    await drain(db, deps);
    expect(calls).toBe(2);
    expect(await mirror.outboxCounts(db)).toEqual({ pending: 0, parked: 0 });
  });

  it('parks after enough consecutive transient failures', async () => {
    let now = new Date('2026-07-01T13:00:00Z');
    const replay = async () => {
      throw new ApiError(503, 'permanently flaky');
    };
    const deps = { replay, now: () => now, rand: () => 0.5 };
    await enqueue(db, [createOp('item-1', 1)], horizon, deps);

    for (let i = 0; i < PARK_AFTER_ATTEMPTS + 2; i++) {
      await drain(db, deps);
      now = new Date(now.getTime() + 60 * 60_000);
    }
    expect(await mirror.outboxCounts(db)).toEqual({ pending: 0, parked: 1 });
  });

  it('parks a semantic 4xx immediately and holds later ops on the SAME aggregate only', async () => {
    const replayed: string[] = [];
    const replay = async (op: ClientOp) => {
      if (op.commandId === cmd(1)) throw new ApiError(404, 'no such item');
      replayed.push(op.commandId);
    };
    const deps = { replay };
    await enqueue(db, [reviseOp('item-dead', 'a', 1), reviseOp('item-dead', 'b', 2), createOp('item-live', 3)], horizon, deps);
    await drain(db, deps);

    expect(replayed).toEqual([cmd(3)]);   // the dead aggregate's follow-up is held, the other proceeds
    expect(await mirror.outboxCounts(db)).toEqual({ pending: 1, parked: 1 });
  });

  it('pauses without touching the row when the session dies (401)', async () => {
    const replay = async () => {
      throw new ApiError(401, 'signed out');
    };
    await enqueue(db, [createOp('item-1', 1)], horizon, { replay });
    await drain(db, { replay });

    const rows = await db.all<mirror.OutboxRow>('SELECT * FROM outbox');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempts).toBe(0);
  });
});

describe('pull', () => {
  it('reads the cursor, pages while hasMore, and persists per page', async () => {
    const deps = pagesDeps([
      { cursor: '10', hasMore: true, changed: [{ item: serverItem('a'), guards: serverGuards() }], deleted: [] },
      { cursor: '20', hasMore: false, changed: [{ item: serverItem('b'), guards: serverGuards() }], deleted: [] },
    ]);
    await pullCal(db, horizon, deps);
    expect(deps.calCalls).toEqual([null, '10']);
    expect(await mirror.getCursor(db, 'cal')).toBe('20');

    await pullCal(db, horizon, pagesDeps([{ cursor: '20', hasMore: false, changed: [], deleted: [] }]));
    // second sync starts from the persisted cursor — the tasks app's dead getCursor stays dead
    const again = pagesDeps([{ cursor: '20', hasMore: false, changed: [], deleted: [] }]);
    await pullCal(db, horizon, again);
    expect(again.calCalls).toEqual(['20']);
  });

  it('REGRESSION: a pending core edit survives a pull that brings fresher other-section state', async () => {
    // Server state with a metadata guard NEWER than the local edit but a core guard OLDER.
    await enqueueOffline([reviseOp('item-1', 'Local edit', 30)]);

    const change: ItemChange = {
      item: serverItem('item-1', { title: 'Server title', metadata: { source: 'web' } }),
      guards: serverGuards({
        core: { ts: T(10), cmd: cmd(90) },
        metadata: { ts: T(40), cmd: cmd(91) },
      }),
    };
    await pullCal(db, horizon, pagesDeps([{ cursor: '5', hasMore: false, changed: [change], deleted: [] }]));

    const item = await mirror.loadItem(db, 'item-1');
    expect(item?.doc.title).toBe('Local edit');            // pending op outranks the older server core
    expect(item?.doc.metadata).toEqual({ source: 'web' }); // fresher server metadata intact
  });

  it('a stale local edit loses the rebase to a newer server core', async () => {
    await enqueueOffline([reviseOp('item-1', 'Stale local', 10)]);

    const change: ItemChange = {
      item: serverItem('item-1', { title: 'Newer server' }),
      guards: serverGuards({ core: { ts: T(20), cmd: cmd(90) } }),
    };
    await pullCal(db, horizon, pagesDeps([{ cursor: '5', hasMore: false, changed: [change], deleted: [] }]));

    expect((await mirror.loadItem(db, 'item-1'))?.doc.title).toBe('Newer server');
  });

  it('applies tombstones: row and occurrences go, remote deletes reach the mirror', async () => {
    await pullCal(db, horizon, pagesDeps([
      { cursor: '5', hasMore: false, changed: [{ item: serverItem('doomed'), guards: serverGuards() }], deleted: [] },
    ]));
    expect(await mirror.loadItem(db, 'doomed')).not.toBeNull();

    await pullCal(db, horizon, pagesDeps([{ cursor: '9', hasMore: false, changed: [], deleted: ['doomed'] }]));
    expect(await mirror.loadItem(db, 'doomed')).toBeNull();
    expect(await mirror.occurrencesBetween(db, '2026-01-01', '2026-12-31')).toHaveLength(0);
  });

  it('full sync prunes unmentioned rows but keeps pending local creates', async () => {
    // Seed a stale mirror row + a local-only create, then full-sync (null cursor) that mentions neither.
    await pullCal(db, horizon, pagesDeps([
      { cursor: '5', hasMore: false, changed: [{ item: serverItem('stale'), guards: serverGuards() }], deleted: [] },
    ]));
    await enqueueOffline([createOp('local-only', 1)]);
    await db.exclusive((tx) => tx.run("DELETE FROM sync_state WHERE scope = 'cal'"));   // force full sync

    await pullCal(db, horizon, pagesDeps([
      { cursor: '50', hasMore: false, changed: [{ item: serverItem('kept'), guards: serverGuards() }], deleted: [] },
    ]));

    expect(await mirror.loadItem(db, 'stale')).toBeNull();
    expect(await mirror.loadItem(db, 'kept')).not.toBeNull();
    expect(await mirror.loadItem(db, 'local-only')).not.toBeNull();
  });

  it('pulls contacts with birthday synthesis and replaces containers', async () => {
    const deps = pagesDeps([{ cursor: '1', hasMore: false, changed: [], deleted: [] }], [{
      cursor: '7', hasMore: false, deleted: [],
      changed: [{
        contact: { id: 'c1', addressBookId: 'book-1', givenName: 'Jane', birthday: { year: 1990, month: 3, day: 14 } },
        guards: {
          core: { ts: T(1), cmd: cmd(1) }, addresses: { ts: T(1), cmd: cmd(1) }, profiles: { ts: T(1), cmd: cmd(1) },
          avatar: { ts: T(1), cmd: cmd(1) }, metadata: { ts: T(1), cmd: cmd(1) }, deceased: { ts: T(1), cmd: cmd(1) },
        },
      }],
    }]);
    await pullContainers(db, deps);
    await pullContacts(db, horizon, deps);

    const bdays = await mirror.occurrencesBetween(db, '2026-03-14', '2026-03-14');
    expect(bdays).toHaveLength(1);
    expect(bdays[0].source).toBe('birthday');
    expect(await mirror.listContainerDocs(db, 'calendars')).toHaveLength(1);
    expect(await mirror.listContainerDocs(db, 'address_books')).toHaveLength(1);
  });

  it('reports whether a pull changed anything, so an empty delta invalidates nothing', async () => {
    const first = await pullCal(db, horizon, pagesDeps([
      { cursor: '1', hasMore: false, changed: [{ item: serverItem('a'), guards: serverGuards() }], deleted: [] },
    ]));
    expect(first.changed).toBe(true);
    const empty = await pullCal(db, horizon, pagesDeps([{ cursor: '1', hasMore: false, changed: [], deleted: [] }]));
    expect(empty).toEqual({ monthKeys: new Set(), changed: false });
  });

  it('an interrupted full sync restarts from scratch instead of resuming as a delta', async () => {
    const dying = pagesDeps([{ cursor: '10', hasMore: true, changed: [{ item: serverItem('a'), guards: serverGuards() }], deleted: [] }]);
    dying.calChanges = async (since) => {
      dying.calCalls.push(since);
      if (since) throw new Error('connection reset');
      return withReset({ cursor: '10', hasMore: true, changed: [{ item: serverItem('a'), guards: serverGuards() }], deleted: [] });
    };
    await expect(pullCal(db, horizon, dying)).rejects.toThrow('connection reset');

    const retry = pagesDeps([{ cursor: '20', hasMore: false, changed: [{ item: serverItem('b'), guards: serverGuards() }], deleted: [] }]);
    await pullCal(db, horizon, retry);
    expect(retry.calCalls).toEqual([null]);
    expect(await mirror.loadItem(db, 'a')).toBeNull();   // pruned: the completed stream never mentioned it
    expect(await mirror.loadItem(db, 'b')).not.toBeNull();

    const next = pagesDeps([{ cursor: '20', hasMore: false, changed: [], deleted: [] }]);
    await pullCal(db, horizon, next);
    expect(next.calCalls).toEqual(['20']);
  });

  it('a reset page turns a delta into a full sync that prunes what the stream omits', async () => {
    await pullCal(db, horizon, pagesDeps([
      { cursor: '5', hasMore: false, changed: [{ item: serverItem('revoked'), guards: serverGuards() }], deleted: [] },
    ]));
    await pullCal(db, horizon, pagesDeps([
      { cursor: '9', hasMore: false, reset: true, changed: [{ item: serverItem('shared'), guards: serverGuards() }], deleted: [] },
    ]));
    expect(await mirror.loadItem(db, 'revoked')).toBeNull();
    expect(await mirror.loadItem(db, 'shared')).not.toBeNull();
  });

  it('tombstones for ids the mirror never held change nothing', async () => {
    await pullCal(db, horizon, pagesDeps([{ cursor: '1', hasMore: false, changed: [], deleted: [] }]));
    const delta = await pullCal(db, horizon, pagesDeps([{ cursor: '2', hasMore: false, changed: [], deleted: ['foreign-1', 'foreign-2'] }]));
    expect(delta.changed).toBe(false);
  });

  it('seeds the standard calendars when no Personal one exists, and refetches', async () => {
    let seeded = false;
    const calls: string[] = [];
    const deps = pagesDeps([{ cursor: '1', hasMore: false, changed: [], deleted: [] }]);
    deps.calContainers = async () => (seeded ? [{ id: 'shared', kind: 'Group' }, { id: 'mine', kind: 'Personal' }] : [{ id: 'shared', kind: 'Group' }]);
    deps.bootstrapCalendars = async () => {
      calls.push('cal');
      seeded = true;
    };
    deps.bootstrapAddressBooks = async () => {
      calls.push('contact');
    };

    await pullContainers(db, deps);
    expect(calls).toEqual(['cal']);   // the harness already has an address book
    expect(await mirror.listContainerDocs(db, 'calendars')).toHaveLength(2);

    await pullContainers(db, deps);
    expect(calls).toEqual(['cal']);
  });

  it('a failing bootstrap does not fail the container pull', async () => {
    const deps = pagesDeps([{ cursor: '1', hasMore: false, changed: [], deleted: [] }]);
    deps.calContainers = async () => [];
    deps.bootstrapCalendars = async () => {
      throw new ApiError(503, 'down');
    };
    await pullContainers(db, deps);
    expect(await mirror.listContainerDocs(db, 'calendars')).toHaveLength(0);
  });

  it('leaves identical containers alone and reports a real change', async () => {
    const deps = pagesDeps([{ cursor: '1', hasMore: false, changed: [], deleted: [] }]);
    expect(await pullContainers(db, deps)).toBe(true);
    expect(await pullContainers(db, deps)).toBe(false);
    await db.exclusive(async (tx) => {
      expect(await mirror.replaceContainers(tx, 'calendars', [{ id: 'other' }])).toBe(true);
    });
  });
});

describe('migrations', () => {
  it('a future migration runs without touching the outbox', async () => {
    await enqueueOffline([createOp('item-1', 1)]);

    const extended = [...MIGRATIONS, 'ALTER TABLE items ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;'];
    await migrate(db, extended);

    const version = await db.first<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(extended.length);
    expect(await mirror.outboxCounts(db)).toEqual({ pending: 1, parked: 0 });
    await db.all('SELECT flagged FROM items');   // new column exists
  });

  it('migrate is idempotent', async () => {
    await migrate(db);
    await migrate(db);
    expect((await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(MIGRATIONS.length);
  });
});

describe('discard rollback contract', () => {
  it('reports the aggregate so the caller can restore server truth', async () => {
    const replay = async () => {
      throw new ApiError(404, 'gone');
    };
    await enqueue(db, [reviseOp('item-1', 'doomed edit', 1)], horizon, { replay });
    await drain(db, { replay });

    const parked = await mirror.listParked(db);
    expect(parked).toHaveLength(1);

    const { discardParked } = await import('./outbox');
    const target = await discardParked(db, parked[0].seq);
    expect(target).toEqual({ domain: 'cal', aggregateId: 'item-1' });
    expect(await mirror.outboxCounts(db)).toEqual({ pending: 0, parked: 0 });
  });
});

describe('grid read surface (M5)', () => {
  const contactOp = (n: number): ClientOp => ({
    kind: 'contact.create', contactId: 'contact-1', sourceKey: 'contact-1@key', addressBookId: 'book-1',
    occurredAt: T(n), commandId: cmd(n),
    core: { givenName: 'Alva', familyName: 'B', birthday: { year: 2019, month: 8, day: 5 } },
  });

  it('joins occurrence rows with item titles, calendar ids, and birthday names', async () => {
    await enqueueOffline([createOp('item-1', 1), contactOp(2)]);

    const rows = await mirror.gridRowsBetween(db, '2026-08-01', '2026-08-31');
    expect(rows).toHaveLength(2);
    const item = rows.find((r) => r.source === 'item')!;
    expect(item).toMatchObject({ source_id: 'item-1', title: 'Item item-1', calendar_id: 'cal-1', all_day: 0 });
    const bday = rows.find((r) => r.source === 'birthday')!;
    expect(bday).toMatchObject({ source_id: 'contact-1', title: 'Alva B', all_day: 1, start_day: '2026-08-05' });
  });

  it('lists live contacts by display name and hides deleted ones', async () => {
    await enqueueOffline([contactOp(1)]);
    expect((await mirror.listContacts(db)).map((c) => c.displayName)).toEqual(['Alva B']);

    await enqueueOffline([{ kind: 'contact.delete', contactId: 'contact-1', occurredAt: T(2), commandId: cmd(2) }]);
    expect(await mirror.listContacts(db)).toHaveLength(0);
  });

  it('retryOne requeues a single parked op without touching its parked siblings', async () => {
    const reject = async () => {
      throw new ApiError(422, 'rejected');
    };
    await enqueue(db, [reviseOp('item-1', 'a', 1), reviseOp('item-2', 'b', 2)], horizon, { replay: reject });
    await drain(db, { replay: reject });
    expect((await mirror.listParked(db)).map((r) => r.aggregate_id)).toEqual(['item-1', 'item-2']);

    const { retryOne } = await import('./outbox');
    const ok = async () => undefined;
    const first = (await mirror.listParked(db))[0];
    await retryOne(db, first.seq, { replay: ok });
    await drain(db, { replay: ok });

    expect((await mirror.listParked(db)).map((r) => r.aggregate_id)).toEqual(['item-2']);
    expect(await mirror.listPendingOps(db)).toHaveLength(0);
  });
});

describe('migration ladder concurrency', () => {
  it('concurrent migrate calls on a virgin db do not race the ladder', async () => {
    const fresh = openNodeDb();
    await Promise.all([migrate(fresh), migrate(fresh), migrate(fresh)]);
    expect(await fresh.first('SELECT 1 AS ok FROM mirror_meta')).toBeNull();   // table exists, empty
    await migrate(fresh);   // and stays idempotent afterwards
  });
});

describe('system-calendar grid filter', () => {
  it('hides items homed only in System-class calendars when asked', async () => {
    await db.exclusive(async (tx) => {
      await mirror.replaceContainers(tx, 'calendars', [
        { id: 'cal-1' },
        { id: 'sys-1', class: 'System' } as { id: string },
      ]);
    });
    await enqueueOffline([createOp('item-1', 1), createOp('item-2', 2, 'sys-1')]);

    const all = await mirror.gridRowsBetween(db, '2026-08-01', '2026-08-31');
    expect(all.map((r) => r.source_id).sort()).toEqual(['item-1', 'item-2']);

    const visible = await mirror.gridRowsBetween(db, '2026-08-01', '2026-08-31', false);
    expect(visible.map((r) => r.source_id)).toEqual(['item-1']);
  });
});
