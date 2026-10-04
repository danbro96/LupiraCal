/** Camera-roll backup queue: pure types + selection rules. Blob-shaped work, so it lives in its own
 *  table rather than the outbox (JSON ops with a causal hold), but it reuses the outbox's discipline —
 *  exponential backoff via @danbro96/lupira-sync-core/backoff and parking after enough consecutive failures. */

export type QueueState = 'pending' | 'uploading' | 'done' | 'parked';

/** One camera-roll asset awaiting (or having completed) backup. `media_store_id` is MediaStore's own id:
 *  stable per device, and half of the server's idempotency triple, so it is the natural primary key. */
export type PhotoQueueRow = {
  media_store_id: string;
  asset_id: string | null;
  state: QueueState;
  content_type: string;
  size_bytes: number;
  taken_at: string;
  latitude: number | null;
  longitude: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  local_uri: string;
  attempts: number;
  next_attempt_at: string | null;
  error: string | null;
  created_at: string;
};

export type PhotoBackupSettings = {
  enabled: boolean;
  wifiOnly: boolean;
  /** Assets created before this instant are ignored. Defaults to the moment backup was enabled;
   *  moving it earlier is how a backfill is requested. */
  backupFrom: string;
};

export const DEFAULT_BACKUP_SETTINGS: Omit<PhotoBackupSettings, 'backupFrom'> = {
  enabled: false,
  wifiOnly: true,
};

/** MediaStore reports mime types the API may not accept; declaring one would just earn a 422 per asset.
 *  Mirrors LupiraPhotoApi's ObjectKeys whitelist — keep the two in step. */
const SUPPORTED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/avif',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/3gpp',
]);

export function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_CONTENT_TYPES.has(contentType.toLowerCase());
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', avif: 'image/avif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', '3gp': 'video/3gpp',
};

/** MediaLibrary gives a filename + mediaType, not a mime type. Extension wins because it distinguishes
 *  heic from jpeg where mediaType only says "photo". */
export function contentTypeOf(filename: string, mediaType: 'image' | 'video' | string): string | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (CONTENT_TYPE_BY_EXT[ext]) return CONTENT_TYPE_BY_EXT[ext];
  // Unknown extension: fall back to the coarse kind so common camera output still uploads.
  if (mediaType === 'image') return 'image/jpeg';
  if (mediaType === 'video') return 'video/mp4';
  return null;
}

/** The file extension a downloaded original is saved under — the media store infers its type from it. */
export function extensionOf(contentType: string): string {
  const type = contentType.toLowerCase();
  return Object.keys(CONTENT_TYPE_BY_EXT).find((ext) => CONTENT_TYPE_BY_EXT[ext] === type)
    ?? (type.startsWith('video/') ? 'mp4' : 'jpg');
}
