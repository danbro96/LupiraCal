import * as Location from 'expo-location';
import { create } from 'zustand';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

/** The live blue dot while the Map tab is open.
 *
 *  Deliberately a foreground-only `watchPositionAsync` subscription, separate from the background
 *  recorder: the puck must work for someone who has never turned tracking on, and it must stop the
 *  moment the map unmounts rather than holding GPS open behind a calendar screen. Lives in sync/ so
 *  the map can read it without the UI owning a subscription (and because state/ is off-limits below). */

export type LivePosition = { lon: number; lat: number; accuracyM: number | null; headingDeg: number | null };

type LiveState = {
  position: LivePosition | null;
  /** Distinguishes "no fix yet" from "we never asked" so the UI can show the right affordance. */
  watching: boolean;
};

type LiveActions = {
  /** Starts watching if permission is already granted. Returns false when it isn't — the caller
   *  decides whether to prompt (the map's locate button does; a passive mount shouldn't). */
  start(): Promise<boolean>;
  stop(): void;
  set(partial: Partial<LiveState>): void;
};

let subscription: Location.LocationSubscription | null = null;

export const useLivePosition = create<LiveState & LiveActions>((set) => ({
  position: null,
  watching: false,

  start: async () => {
    if (subscription) return true;
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return false;

    // High accuracy with a short distance filter: this is a visible dot the user is watching, and it
    // only runs while the map is on screen.
    subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2_000 },
      (fix) => set({
        position: {
          lon: fix.coords.longitude,
          lat: fix.coords.latitude,
          accuracyM: fix.coords.accuracy,
          headingDeg: fix.coords.heading,
        },
      }),
    );
    set({ watching: true });
    logDebug('location', 'live position watch started');
    return true;
  },

  stop: () => {
    subscription?.remove();
    subscription = null;
    set({ watching: false });
  },

  set: (partial) => set(partial),
}));

/** The OS's cached fix, if location is already allowed and it's recent — never prompts, never starts GPS. */
export async function lastKnownPosition(): Promise<{ lat: number; lon: number } | null> {
  const { granted } = await Location.getForegroundPermissionsAsync();
  if (!granted) return null;
  const fix = await Location.getLastKnownPositionAsync({ maxAge: 3_600_000 });
  return fix ? { lat: fix.coords.latitude, lon: fix.coords.longitude } : null;
}
