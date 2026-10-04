import { DEFAULT_BACKUP_SETTINGS, type PhotoBackupSettings } from '../domain/photoBackup';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { getMeta, setMeta } from './mirror';

/** Backup settings live in mirror_meta so the uploader (sync layer) can read them without reaching up
 *  into the store — same reasoning as prefs-store's persistence, but readable from below. */

const SETTINGS_KEY = 'photos.backupSettings';

export const defaultBackupSettings = (): PhotoBackupSettings =>
  ({ ...DEFAULT_BACKUP_SETTINGS, backupFrom: new Date().toISOString() });

export async function loadBackupSettings(db: Db): Promise<PhotoBackupSettings> {
  const stored = await getMeta(db, SETTINGS_KEY);
  if (!stored) return defaultBackupSettings();
  return { ...defaultBackupSettings(), ...(JSON.parse(stored) as Partial<PhotoBackupSettings>) };
}

export async function saveBackupSettings(db: Db, settings: PhotoBackupSettings): Promise<void> {
  await db.exclusive((tx) => setMeta(tx, SETTINGS_KEY, JSON.stringify(settings)));
}
