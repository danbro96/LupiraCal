import { create } from 'zustand';
import { getDb } from '../data/db/expoDb';
import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import { MIGRATIONS } from '../data/db/schema';
import { ensurePhotoPermission } from '../data/photoLibrary';
import { clearUnfinishedUploads } from '../data/photoQueue';
import { defaultBackupSettings, loadBackupSettings, saveBackupSettings } from '../data/photoSettings';
import type { PhotoBackupSettings } from '../domain/photoBackup';
import { usePhotoBackupStatus } from '../sync/photoBackupStatus';

/** Camera-roll backup SETTINGS for the UI. The persisted copy in mirror_meta is what the uploader
 *  reads (data layer), so this store is a view over it plus the permission gate. Live counters and
 *  transfer progress live in sync/photoBackupStatus — the uploader can't write upward into here. */

type PhotoBackupState = {
  loaded: boolean;
  settings: PhotoBackupSettings;
};

type PhotoBackupActions = {
  init(): Promise<void>;
  /** Turning backup on asks for the media permissions first: without a grant there is nothing to scan,
   *  and ACCESS_MEDIA_LOCATION is what preserves EXIF GPS. Returns false when the grant was refused. */
  setEnabled(value: boolean): Promise<boolean>;
  setWifiOnly(value: boolean): Promise<void>;
  setBackupFrom(iso: string): Promise<void>;
};

export const usePhotoBackup = create<PhotoBackupState & PhotoBackupActions>((set, get) => ({
  loaded: false,
  settings: defaultBackupSettings(),

  init: async () => {
    const db = await getDb();
    await migrate(db, MIGRATIONS);
    set({ settings: await loadBackupSettings(db), loaded: true });
    await usePhotoBackupStatus.getState().refresh(db);
  },

  setEnabled: async (value) => {
    if (value && !(await ensurePhotoPermission())) return false;
    await persist(set, get, { enabled: value });
    return true;
  },

  setWifiOnly: async (value) => persist(set, get, { wifiOnly: value }),

  setBackupFrom: async (iso) => {
    await persist(set, get, { backupFrom: iso });
    // Un-uploaded rows were derived from the old window; drop them so the next scan re-derives from
    // the new one. Finished uploads are left alone (re-declaring them would be a no-op anyway).
    const db = await getDb();
    await db.exclusive((tx) => clearUnfinishedUploads(tx));
    await usePhotoBackupStatus.getState().refresh(db);
  },
}));

async function persist(
  set: (partial: Partial<PhotoBackupState>) => void,
  get: () => PhotoBackupState,
  patch: Partial<PhotoBackupSettings>,
): Promise<void> {
  const settings = { ...get().settings, ...patch };
  set({ settings });
  await saveBackupSettings(await getDb(), settings);
}
