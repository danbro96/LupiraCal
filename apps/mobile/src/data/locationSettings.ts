import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { getMeta, setMeta } from './mirror';

/** Tracking settings live in mirror_meta so the recorder and uploader (sync layer) can read them
 *  without importing state/ — same reasoning as photoSettings and the bridge flags. */

const SETTINGS_KEY = 'location.trackingSettings';

export type TrackingSettings = {
  enabled: boolean;
  /** Local pause. The server has its own kill switch; this one stops the OS updates entirely. */
  paused: boolean;
};

export const defaultTrackingSettings = (): TrackingSettings => ({ enabled: false, paused: false });

export async function loadTrackingSettings(db: Db): Promise<TrackingSettings> {
  const stored = await db.exclusive((tx) => getMeta(tx, SETTINGS_KEY));
  if (!stored) return defaultTrackingSettings();
  return { ...defaultTrackingSettings(), ...(JSON.parse(stored) as Partial<TrackingSettings>) };
}

export async function saveTrackingSettings(db: Db, settings: TrackingSettings): Promise<void> {
  await db.exclusive((tx) => setMeta(tx, SETTINGS_KEY, JSON.stringify(settings)));
}
