import type { PhotoQueueRow, QueueState } from '../domain/photoBackup';
import type { Tx } from './db/types';

/** Row-level persistence for the camera-roll backup queue. Same contract as mirror.ts: every function
 *  takes a Tx, so a scan can never interleave with a drain. */

/** INSERT OR IGNORE: a rescan re-sees every asset, and an already-queued (or already-done) row must keep
 *  its state, attempts, and asset_id rather than being reset to pending. */
export async function enqueueAsset(tx: Tx, row: Omit<PhotoQueueRow, 'state' | 'attempts' | 'next_attempt_at' | 'error' | 'asset_id'>): Promise<void> {
  await tx.run(
    `INSERT OR IGNORE INTO photo_upload_queue
       (media_store_id, content_type, size_bytes, taken_at, latitude, longitude, width, height, duration_seconds, local_uri, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.media_store_id, row.content_type, row.size_bytes, row.taken_at, row.latitude, row.longitude,
      row.width, row.height, row.duration_seconds, row.local_uri, row.created_at],
  );
}

/** Due work, oldest capture first — a backfill drains chronologically instead of newest-first. */
export async function dueUploads(tx: Tx, nowIso: string, limit: number): Promise<PhotoQueueRow[]> {
  return tx.all<PhotoQueueRow>(
    `SELECT * FROM photo_upload_queue
     WHERE state IN ('pending', 'uploading')
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY taken_at LIMIT ?`,
    [nowIso, limit],
  );
}

export async function setQueueState(tx: Tx, mediaStoreId: string, state: QueueState, assetId?: string | null): Promise<void> {
  await tx.run(
    `UPDATE photo_upload_queue SET state = ?, asset_id = COALESCE(?, asset_id), error = NULL WHERE media_store_id = ?`,
    [state, assetId ?? null, mediaStoreId],
  );
}

export async function markDone(tx: Tx, mediaStoreId: string, assetId: string): Promise<void> {
  await tx.run(
    `UPDATE photo_upload_queue SET state = 'done', asset_id = ?, next_attempt_at = NULL, error = NULL
     WHERE media_store_id = ?`,
    [assetId, mediaStoreId],
  );
}

/** Files an asset as already backed up, so no scan ever uploads it. */
export async function recordUploaded(
  tx: Tx, row: Omit<PhotoQueueRow, 'state' | 'attempts' | 'next_attempt_at' | 'error' | 'asset_id'>, assetId: string,
): Promise<void> {
  await enqueueAsset(tx, row);
  await markDone(tx, row.media_store_id, assetId);
}

export async function markFailure(tx: Tx, mediaStoreId: string, error: string, parked: boolean, nextAttemptAt: string | null): Promise<void> {
  await tx.run(
    `UPDATE photo_upload_queue
     SET state = ?, attempts = attempts + 1, next_attempt_at = ?, error = ?
     WHERE media_store_id = ?`,
    [parked ? 'parked' : 'pending', nextAttemptAt, error, mediaStoreId],
  );
}

export async function retryParkedUploads(tx: Tx): Promise<void> {
  await tx.run(`UPDATE photo_upload_queue SET state = 'pending', attempts = 0, next_attempt_at = NULL, error = NULL WHERE state = 'parked'`);
}

export async function queueCounts(tx: Tx): Promise<{ pending: number; parked: number; done: number }> {
  const rows = await tx.all<{ state: QueueState; n: number }>(
    `SELECT state, COUNT(*) AS n FROM photo_upload_queue GROUP BY state`);
  const of = (s: QueueState) => rows.find((r) => r.state === s)?.n ?? 0;
  return { pending: of('pending') + of('uploading'), parked: of('parked'), done: of('done') };
}

export async function listParkedUploads(tx: Tx): Promise<PhotoQueueRow[]> {
  return tx.all<PhotoQueueRow>(`SELECT * FROM photo_upload_queue WHERE state = 'parked' ORDER BY taken_at`);
}

/** Backup being switched off (or a re-enable with an earlier `backupFrom`) must not resurrect finished
 *  work; only un-uploaded rows are dropped so a rescan re-derives them from the new window. */
export async function clearUnfinishedUploads(tx: Tx): Promise<void> {
  await tx.run(`DELETE FROM photo_upload_queue WHERE state != 'done'`);
}
