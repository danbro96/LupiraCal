import { create } from 'zustand';
import { getDb } from '../data/db/expoDb';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { queueCounts } from '../data/photoQueue';

/** Live backup counters + transfer progress. Lives in the sync layer for the same reason syncStatus
 *  does: the uploader must write it without importing state/ (upward), and the UI reads it from above. */

type PhotoBackupStatus = {
  pending: number;
  parked: number;
  done: number;
  /** Byte progress of the asset currently uploading — a queue count alone looks stuck on a long video. */
  progress: { mediaStoreId: string; fraction: number } | null;
};

type PhotoBackupStatusActions = {
  refresh(dbOverride?: Db): Promise<void>;
  setProgress(progress: PhotoBackupStatus['progress']): void;
};

export const usePhotoBackupStatus = create<PhotoBackupStatus & PhotoBackupStatusActions>((set) => ({
  pending: 0,
  parked: 0,
  done: 0,
  progress: null,

  refresh: async (dbOverride) => {
    const db = dbOverride ?? (await getDb());
    set(await db.exclusive((tx) => queueCounts(tx)));
  },

  setProgress: (progress) => set({ progress }),
}));
