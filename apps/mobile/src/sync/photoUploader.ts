import NetInfo from '@react-native-community/netinfo';
import { v7 as uuidv7 } from 'uuid';
import { declarePhoto, completePhotoUpload } from '@lupira/cal-api/fetch/photo';
import type { PhotoAssetDto } from '@lupira/cal-api/models';
import { getDb } from '../data/db/expoDb';
import type { Db } from '../data/db/types';
import * as mirror from '../data/mirror';
import { saveToDevice, scanAssets, uploadToPresignedUrl } from '../data/photoLibrary';
import * as queue from '../data/photoQueue';
import { loadBackupSettings } from '../data/photoSettings';
import { nextAttemptDelayMs, PARK_AFTER_ATTEMPTS } from '../domain/backoff';
import type { PhotoBackupSettings, PhotoQueueRow } from '../domain/photoBackup';
import { logDebug } from '../debug/log';
import { usePhotoBackupStatus } from './photoBackupStatus';

/** Camera-roll backup: scan MediaStore for assets inside the backup window, then drain the queue by
 *  declaring each asset, PUTting the bytes straight to the object store's presigned URL, and completing.
 *  Single-flight like the outbox, and deliberately separate from it: blobs need progress, a WiFi gate,
 *  and per-asset resumability that JSON ops don't. */

const SCAN_PAGE = 200;
const DRAIN_BATCH = 8;
const DEVICE_ID_KEY = 'photo.deviceId';

let draining: Promise<void> | null = null;

/** Stable per-install device id — the server's idempotency triple is (principal, device, mediaStoreId),
 *  so this must survive app restarts but need not survive a reinstall (MediaStore ids don't either). */
export async function deviceId(db: Db): Promise<string> {
  const existing = await mirror.getMeta(db, DEVICE_ID_KEY);
  if (existing) return existing;
  const minted = uuidv7();
  await db.exclusive((tx) => mirror.setMeta(tx, DEVICE_ID_KEY, minted));
  return minted;
}

/** Enqueues everything in the window that isn't already queued. Pages until a pass yields nothing,
 *  so the first run after a backfill date change picks up the whole history. */
export async function scanLibrary(db: Db, settings: PhotoBackupSettings): Promise<number> {
  const sinceMs = Date.parse(settings.backupFrom);
  let offset = 0;
  let enqueued = 0;
  for (;;) {
    const batch = await scanAssets(sinceMs, SCAN_PAGE, offset);
    if (batch.length === 0) break;
    await db.exclusive(async (tx) => {
      for (const asset of batch) {
        await queue.enqueueAsset(tx, {
          media_store_id: asset.mediaStoreId,
          content_type: asset.contentType,
          size_bytes: asset.sizeBytes,
          taken_at: asset.takenAt,
          latitude: asset.latitude,
          longitude: asset.longitude,
          width: asset.width,
          height: asset.height,
          duration_seconds: asset.durationSeconds,
          local_uri: asset.localUri,
          created_at: new Date().toISOString(),
        });
      }
    });
    enqueued += batch.length;
    offset += SCAN_PAGE;
  }
  return enqueued;
}

/** True when the connection satisfies the WiFi-only setting. Cellular uploads of video originals are
 *  the reason this defaults on. */
async function transportAllowed(wifiOnly: boolean): Promise<boolean> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return false;
  return !wifiOnly || state.type === 'wifi' || state.type === 'ethernet';
}

export function runPhotoBackup(dbOverride?: Db): Promise<void> {
  draining ??= drainOnce(dbOverride).finally(() => {
    draining = null;
  });
  return draining;
}

async function drainOnce(dbOverride?: Db): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const settings = await loadBackupSettings(db);
  if (!settings.enabled) return;
  if (!(await transportAllowed(settings.wifiOnly))) {
    logDebug('photos', 'backup skipped — transport not allowed');
    return;
  }

  const status = usePhotoBackupStatus.getState();
  const device = await deviceId(db);

  try {
    await scanLibrary(db, settings);
    await status.refresh(db);

    for (;;) {
      const due = await db.exclusive((tx) => queue.dueUploads(tx, new Date().toISOString(), DRAIN_BATCH));
      if (due.length === 0) break;
      for (const row of due) {
        // Losing WiFi mid-drain stops the pass rather than burning the retry budget on every row.
        if (!(await transportAllowed(settings.wifiOnly))) return;
        await uploadOne(db, device, row);
        await status.refresh(db);
      }
    }
  } finally {
    status.setProgress(null);
  }
}

async function uploadOne(db: Db, device: string, row: PhotoQueueRow): Promise<void> {
  const status = usePhotoBackupStatus.getState();
  try {
    const declared = await declarePhoto({
      deviceId: device,
      mediaStoreId: row.media_store_id,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      takenAt: row.taken_at,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      durationSeconds: row.duration_seconds ?? undefined,
    });
    if (declared.status !== 200) throw new Error(`declare failed (${declared.status})`);
    const { assetId, uploadUrl, requiredHeaders } = declared.data;

    // No uploadUrl = the server already has the bytes (a previous run's PUT landed but complete
    // never ran, or this is a re-declare of finished work). Skip straight to completing.
    if (uploadUrl) {
      await db.exclusive((tx) => queue.setQueueState(tx, row.media_store_id, 'uploading', assetId));
      status.setProgress({ mediaStoreId: row.media_store_id, fraction: 0 });
      const httpStatus = await uploadToPresignedUrl(row.local_uri, uploadUrl, requiredHeaders ?? {},
        (fraction) => status.setProgress({ mediaStoreId: row.media_store_id, fraction }));
      if (httpStatus < 200 || httpStatus >= 300) throw new Error(`upload failed (${httpStatus})`);
    }

    const completed = await completePhotoUpload(assetId);
    if (completed.status !== 200) throw new Error(`complete failed (${completed.status})`);

    await db.exclusive((tx) => queue.markDone(tx, row.media_store_id, assetId));
    logDebug('photos', `backed up ${row.media_store_id}`);
  } catch (e) {
    const attempts = row.attempts + 1;
    const parked = attempts >= PARK_AFTER_ATTEMPTS;
    const nextAttemptAt = parked ? null : new Date(Date.now() + nextAttemptDelayMs(attempts)).toISOString();
    await db.exclusive((tx) => queue.markFailure(tx, row.media_store_id, String(e), parked, nextAttemptAt));
    logDebug('photos', `backup failed for ${row.media_store_id} (attempt ${attempts}): ${String(e)}`);
  } finally {
    status.setProgress(null);
  }
}

/** Un-parks everything and drains immediately (the Settings "retry" action). */
export async function retryParkedPhotos(dbOverride?: Db): Promise<void> {
  const db = dbOverride ?? (await getDb());
  await db.exclusive((tx) => queue.retryParkedUploads(tx));
  await runPhotoBackup(db);
}

/** Saves an original back to the phone. The copy is a new media-store asset with a fresh creation time
 *  that the next scan would upload all over again, so it is filed as already backed up. False when
 *  the gallery refused write access. */
export async function restorePhoto(photo: PhotoAssetDto & { originalUrl: string }, dbOverride?: Db): Promise<boolean> {
  const mediaStoreId = await saveToDevice(photo.originalUrl, photo.id, photo.contentType);
  if (!mediaStoreId) return false;
  const db = dbOverride ?? (await getDb());
  await db.exclusive((tx) => queue.recordUploaded(tx, {
    media_store_id: mediaStoreId,
    content_type: photo.contentType,
    size_bytes: photo.sizeBytes,
    taken_at: photo.takenAt,
    latitude: photo.latitude ?? null,
    longitude: photo.longitude ?? null,
    width: photo.width ?? null,
    height: photo.height ?? null,
    duration_seconds: photo.durationSeconds ?? null,
    local_uri: '',
    created_at: new Date().toISOString(),
  }, photo.id));
  await usePhotoBackupStatus.getState().refresh(db);
  return true;
}
