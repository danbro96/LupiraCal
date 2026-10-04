import { create } from 'zustand';
import { getDb } from '../data/db/expoDb';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { oldestQueuedTs, queueDepth } from '../data/locationQueue';

/** Live tracking counters. Lives in the sync layer for the same reason syncStatus and
 *  photoBackupStatus do: the recorder and uploader must write it without importing state/. */

type TrackingStatus = {
  /** OS location updates are actually running (not merely enabled in settings). */
  recording: boolean;
  queued: number;
  /** Timestamp of the oldest un-uploaded fix — the honest answer to "how far behind am I". */
  oldestQueuedTs: string | null;
  lastUploadAt: string | null;
  lastError: string | null;
  /** Server-side kill switch, as last reported by an ingest receipt or state poll. */
  serverPaused: boolean;
};

type TrackingStatusActions = {
  refresh(dbOverride?: Db): Promise<void>;
  set(partial: Partial<TrackingStatus>): void;
};

export const useTrackingStatus = create<TrackingStatus & TrackingStatusActions>((set) => ({
  recording: false,
  queued: 0,
  oldestQueuedTs: null,
  lastUploadAt: null,
  lastError: null,
  serverPaused: false,

  refresh: async (dbOverride) => {
    const db = dbOverride ?? (await getDb());
    const [queued, oldest] = await db.exclusive(async (tx) => [await queueDepth(tx), await oldestQueuedTs(tx)] as const);
    set({ queued, oldestQueuedTs: oldest });
  },

  set: (partial) => set(partial),
}));
