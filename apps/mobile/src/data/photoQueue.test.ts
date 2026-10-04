import { beforeEach, describe, expect, it } from 'vitest';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import { MIGRATIONS } from './db/schema';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import * as queue from './photoQueue';

let db: Db;

beforeEach(async () => {
  db = openNodeDb();
  await migrate(db, MIGRATIONS);
});

const asset = (id: string, takenAt = '2026-08-20T10:00:00.000Z') => ({
  media_store_id: id,
  content_type: 'image/jpeg',
  size_bytes: 1234,
  taken_at: takenAt,
  latitude: 59.33,
  longitude: 18.07,
  width: 4032,
  height: 3024,
  duration_seconds: null,
  local_uri: `file:///dcim/${id}.jpg`,
  created_at: '2026-08-23T12:00:00.000Z',
});

const NOW = '2026-08-23T12:00:00.000Z';

describe('photo upload queue', () => {
  it('enqueues pending work and returns it oldest-capture-first', async () => {
    await db.exclusive(async (tx) => {
      await queue.enqueueAsset(tx, asset('b', '2026-08-20T10:00:00.000Z'));
      await queue.enqueueAsset(tx, asset('a', '2026-08-01T10:00:00.000Z'));
    });

    const due = await db.exclusive((tx) => queue.dueUploads(tx, NOW, 10));
    expect(due.map((r) => r.media_store_id)).toEqual(['a', 'b']);
    expect(due[0].state).toBe('pending');
  });

  it('a rescan never resets in-flight or finished rows', async () => {
    await db.exclusive(async (tx) => {
      await queue.enqueueAsset(tx, asset('a'));
      await queue.markDone(tx, 'a', 'asset-1');
      // Same asset re-seen by the next scan pass.
      await queue.enqueueAsset(tx, asset('a'));
    });

    const rows = await db.exclusive((tx) => queue.dueUploads(tx, NOW, 10));
    expect(rows).toEqual([]);
    const counts = await db.exclusive((tx) => queue.queueCounts(tx));
    expect(counts).toEqual({ pending: 0, parked: 0, done: 1 });
  });

  it('backs off with next_attempt_at and withholds the row until it is due', async () => {
    await db.exclusive(async (tx) => {
      await queue.enqueueAsset(tx, asset('a'));
      await queue.markFailure(tx, 'a', 'network', false, '2026-08-23T12:05:00.000Z');
    });

    expect(await db.exclusive((tx) => queue.dueUploads(tx, NOW, 10))).toEqual([]);
    const later = await db.exclusive((tx) => queue.dueUploads(tx, '2026-08-23T12:06:00.000Z', 10));
    expect(later).toHaveLength(1);
    expect(later[0].attempts).toBe(1);
    expect(later[0].error).toBe('network');
  });

  it('parks a row out of the drain and only a retry brings it back', async () => {
    await db.exclusive(async (tx) => {
      await queue.enqueueAsset(tx, asset('a'));
      await queue.markFailure(tx, 'a', 'unsupported', true, null);
    });

    expect(await db.exclusive((tx) => queue.dueUploads(tx, '2027-01-01T00:00:00.000Z', 10))).toEqual([]);
    expect((await db.exclusive((tx) => queue.queueCounts(tx))).parked).toBe(1);
    expect(await db.exclusive((tx) => queue.listParkedUploads(tx))).toHaveLength(1);

    await db.exclusive((tx) => queue.retryParkedUploads(tx));
    const due = await db.exclusive((tx) => queue.dueUploads(tx, NOW, 10));
    expect(due).toHaveLength(1);
    expect(due[0].attempts).toBe(0);
  });

  it('keeps an uploading row claimable so an interrupted transfer resumes', async () => {
    await db.exclusive(async (tx) => {
      await queue.enqueueAsset(tx, asset('a'));
      await queue.setQueueState(tx, 'a', 'uploading', 'asset-1');
    });

    const due = await db.exclusive((tx) => queue.dueUploads(tx, NOW, 10));
    expect(due).toHaveLength(1);
    // The declared asset id survives so the resumed pass completes the same asset.
    expect(due[0].asset_id).toBe('asset-1');
  });

  it('clearing unfinished work leaves completed uploads alone', async () => {
    await db.exclusive(async (tx) => {
      await queue.enqueueAsset(tx, asset('done'));
      await queue.markDone(tx, 'done', 'asset-1');
      await queue.enqueueAsset(tx, asset('pending'));
      await queue.enqueueAsset(tx, asset('parked'));
      await queue.markFailure(tx, 'parked', 'boom', true, null);
      await queue.clearUnfinishedUploads(tx);
    });

    expect(await db.exclusive((tx) => queue.queueCounts(tx))).toEqual({ pending: 0, parked: 0, done: 1 });
  });
});
