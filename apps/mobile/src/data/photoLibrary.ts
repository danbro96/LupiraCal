import { File, Paths } from 'expo-file-system';
import { Asset, AssetField, MediaType, Query, requestPermissionsAsync } from 'expo-media-library';
import { contentTypeOf, extensionOf, isSupportedContentType } from '../domain/photoBackup';
import { logDebug } from '../debug/log';

/** MediaStore adapter for the backup queue. Scanning uses `exeForMetadata()` — it reads the cheap
 *  media-store columns without resolving file paths, so a full-library sweep stays fast; per-asset
 *  details (uri, size, EXIF location) are resolved only for assets we are actually going to enqueue. */

export type ScannedAsset = {
  mediaStoreId: string;
  contentType: string;
  sizeBytes: number;
  takenAt: string;
  latitude: number | null;
  longitude: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  localUri: string;
};

/** ACCESS_MEDIA_LOCATION is what makes `getLocation()` return un-redacted EXIF GPS; without it the
 *  coordinates are stripped and the server has to fall back to location history. */
export async function ensurePhotoPermission(): Promise<boolean> {
  const response = await requestPermissionsAsync(false, ['photo', 'video']);
  return response.granted;
}

/** Metadata for assets created after `sinceMs`, oldest first (a backfill drains chronologically).
 *  `limit` bounds one scan pass; the caller re-scans until a pass returns nothing new. */
export async function scanAssets(sinceMs: number, limit: number, offset = 0): Promise<ScannedAsset[]> {
  const metadata = await new Query()
    .gt(AssetField.CREATION_TIME, sinceMs)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: true })
    .limit(limit)
    .offset(offset)
    .exeForMetadata();

  const scanned: ScannedAsset[] = [];
  for (const meta of metadata) {
    if (meta.mediaType !== MediaType.IMAGE && meta.mediaType !== MediaType.VIDEO) continue;
    const contentType = contentTypeOf(meta.filename ?? '', meta.mediaType);
    if (!contentType || !isSupportedContentType(contentType)) continue;
    // creationTime is the whole basis of the backup window and the server's TakenAt — an asset
    // without one can't be placed in time, so skip rather than guess.
    if (meta.creationTime == null) continue;

    const resolved = await resolveAsset(meta.id);
    if (!resolved) continue;

    scanned.push({
      mediaStoreId: meta.id,
      contentType,
      sizeBytes: resolved.sizeBytes,
      takenAt: new Date(meta.creationTime).toISOString(),
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      width: meta.width,
      height: meta.height,
      durationSeconds: meta.duration == null ? null : meta.duration / 1000,
      localUri: resolved.uri,
    });
  }
  return scanned;
}

async function resolveAsset(id: string): Promise<{ uri: string; sizeBytes: number; latitude: number | null; longitude: number | null } | null> {
  try {
    const asset = new Asset(id);
    const uri = await asset.getUri();
    const size = new File(uri).size;
    if (size == null || size <= 0) return null;

    // Location is best-effort: it throws when ACCESS_MEDIA_LOCATION was denied, and is simply absent
    // for assets with no EXIF GPS. Either way the server geotags from location history instead.
    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const location = await asset.getLocation();
      if (location) ({ latitude, longitude } = location);
    } catch {
      // no media-location permission — upload without coordinates
    }
    return { uri, sizeBytes: size, latitude, longitude };
  } catch (e) {
    // Deleted between the query and the resolve, or unreadable — drop it from this pass.
    logDebug('photos', `asset ${id} unreadable: ${String(e)}`);
    return null;
  }
}

/** Streams one file to a presigned URL. Content-Type must match what was signed, and no bearer is
 *  sent — the signature IS the authorization, and an extra Authorization header breaks SigV4. */
export async function uploadToPresignedUrl(
  localUri: string,
  url: string,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
): Promise<number> {
  const task = new File(localUri).createUploadTask(url, {
    httpMethod: 'PUT',
    headers,
    onProgress: onProgress && (({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) onProgress(bytesSent / totalBytes);
    }),
  });
  const result = await task.uploadAsync();
  return result.status;
}

/** Downloads an original into the device gallery and returns its new media-store id, or null when
 *  refused. Write-only access is enough to insert, so this never asks to read the whole library. */
export async function saveToDevice(url: string, photoId: string, contentType: string): Promise<string | null> {
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) return null;
  const target = new File(Paths.cache, `${photoId}.${extensionOf(contentType)}`);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  try {
    return (await Asset.create(file.uri)).id;
  } finally {
    file.delete();
  }
}
