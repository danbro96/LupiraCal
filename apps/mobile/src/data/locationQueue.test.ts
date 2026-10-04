import { beforeEach, describe, expect, it } from 'vitest';
import { openNodeDb } from './db/nodeDb';
import { MIGRATIONS, migrate } from './db/schema';
import type { Db } from './db/types';
import * as queue from './locationQueue';

let db: Db;

beforeEach(async () => {
  db = openNodeDb();
  await migrate(db);
});

const fix = (over: Partial<Parameters<typeof queue.enqueueFix>[1]> = {}) => ({
  ts: '2026-08-30T12:00:00.000Z',
  lat: 59.33,
  lon: 18.07,
  accuracyM: 8,
  altitudeM: null,
  headingDeg: null,
  speedMps: 1.2,
  activity: 'Walk' as const,
  provider: 'Fused' as const,
  batteryPct: 70,
  isMoving: true,
  isMock: false,
  ...over,
});

const NOW = '2026-08-30T12:05:00.000Z';

describe('location fix queue', () => {
  it('assigns strictly monotonic seqs, including across a full drain to empty', async () => {
    const first = await db.exclusive(async (tx) => [await queue.enqueueFix(tx, fix()), await queue.enqueueFix(tx, fix())]);
    expect(first).toEqual([1, 2]);

    await db.exclusive((tx) => queue.deleteFixes(tx, first));
    // The counter must survive an emptied table: reusing seq 1 with a new ts double-inserts server-side,
    // because the server's key is (device, ts, seq).
    const afterDrain = await db.exclusive((tx) => queue.enqueueFix(tx, fix()));
    expect(afterDrain).toBe(3);
  });

  it('returns pending work oldest-first and honours the limit', async () => {
    await db.exclusive(async (tx) => {
      for (let i = 0; i < 5; i++) await queue.enqueueFix(tx, fix());
    });
    const batch = await db.exclusive((tx) => queue.pendingFixes(tx, NOW, 3));
    expect(batch.map((f) => f.seq)).toEqual([1, 2, 3]);
  });

  it('withholds a deferred row until it is due, then returns it', async () => {
    const seq = await db.exclusive((tx) => queue.enqueueFix(tx, fix()));
    await db.exclusive((tx) => queue.deferFix(tx, seq, '2026-08-30T13:00:00.000Z'));

    expect(await db.exclusive((tx) => queue.pendingFixes(tx, NOW, 10))).toEqual([]);
    const later = await db.exclusive((tx) => queue.pendingFixes(tx, '2026-08-30T13:30:00.000Z', 10));
    expect(later.map((f) => f.seq)).toEqual([seq]);
  });

  it('round-trips every field the server cares about', async () => {
    await db.exclusive((tx) => queue.enqueueFix(tx, fix({ isMock: true, isMoving: false, altitudeM: 21.5 })));
    const [stored] = await db.exclusive((tx) => queue.pendingFixes(tx, NOW, 1));
    expect(stored).toMatchObject({
      ts: '2026-08-30T12:00:00.000Z', lat: 59.33, lon: 18.07, accuracyM: 8, altitudeM: 21.5,
      speedMps: 1.2, activity: 'Walk', provider: 'Fused', batteryPct: 70, isMoving: false, isMock: true,
    });
  });

  it('deletes everything at or below a server high-water mark', async () => {
    await db.exclusive(async (tx) => {
      for (let i = 0; i < 4; i++) await queue.enqueueFix(tx, fix());
    });
    await db.exclusive((tx) => queue.deleteFixesUpTo(tx, 2));
    const rest = await db.exclusive((tx) => queue.pendingFixes(tx, NOW, 10));
    expect(rest.map((f) => f.seq)).toEqual([3, 4]);
  });

  it('prunes rows the server can never accept again', async () => {
    await db.exclusive(async (tx) => {
      await queue.enqueueFix(tx, fix({ ts: '2026-01-01T00:00:00.000Z' }));
      await queue.enqueueFix(tx, fix());
    });
    const dropped = await db.exclusive((tx) => queue.pruneExpired(tx, '2026-06-01T00:00:00.000Z'));
    expect(dropped).toBe(1);
    expect(await db.exclusive((tx) => queue.queueDepth(tx))).toBe(1);
  });

  it('caps the queue oldest-first so a long offline stretch cannot grow without bound', async () => {
    await db.exclusive(async (tx) => {
      for (let i = 0; i < 6; i++) await queue.enqueueFix(tx, fix());
    });
    const trimmed = await db.exclusive((tx) => queue.trimToCap(tx, 4));
    expect(trimmed).toBe(2);
    const rest = await db.exclusive((tx) => queue.pendingFixes(tx, NOW, 10));
    expect(rest.map((f) => f.seq)).toEqual([3, 4, 5, 6]);
  });

  it('floors the counter above what the server already holds (reinstall repair)', async () => {
    // SecureStore restored the device key but the database started empty, so the local counter would
    // otherwise re-issue seq 1 against history the server already has.
    await db.exclusive((tx) => queue.ensureSeqAbove(tx, 500));
    const seq = await db.exclusive((tx) => queue.enqueueFix(tx, fix()));
    expect(seq).toBe(501);
  });

  it('never lowers the counter', async () => {
    await db.exclusive(async (tx) => {
      await queue.enqueueFix(tx, fix());
      await queue.enqueueFix(tx, fix());
      await queue.ensureSeqAbove(tx, 1);
    });
    expect(await db.exclusive((tx) => queue.enqueueFix(tx, fix()))).toBe(3);
  });

  it('reports depth and the oldest queued timestamp for the status surface', async () => {
    await db.exclusive(async (tx) => {
      await queue.enqueueFix(tx, fix({ ts: '2026-08-30T10:00:00.000Z' }));
      await queue.enqueueFix(tx, fix({ ts: '2026-08-30T11:00:00.000Z' }));
    });
    expect(await db.exclusive((tx) => queue.queueDepth(tx))).toBe(2);
    expect(await db.exclusive((tx) => queue.oldestQueuedTs(tx))).toBe('2026-08-30T10:00:00.000Z');
  });

  it('keeps the migration ladder append-only', async () => {
    // A shipped entry must never be edited — an installed app only runs the rungs above its version.
    expect(MIGRATIONS).toHaveLength(4);
    const upgraded = openNodeDb();
    await migrate(upgraded, MIGRATIONS.slice(0, 2));
    await migrate(upgraded, MIGRATIONS);
    await upgraded.exclusive((tx) => queue.enqueueFix(tx, fix()));
    expect(await upgraded.exclusive((tx) => queue.queueDepth(tx))).toBe(1);
  });
});
