import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';
import { getDb } from '../data/db/expoDb';
import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import { MIGRATIONS } from '../data/db/schema';
import { ensureDevice, forgetDevice, loadDevice } from '../data/locationDevice';
import { clearQueue } from '../data/locationQueue';
import { defaultTrackingSettings, loadTrackingSettings, saveTrackingSettings, type TrackingSettings } from '../data/locationSettings';
import { purgeLocationHistory } from '@lupira/cal-api/fetch/location';
import { isRecording, startRecording, stopRecording } from '../sync/locationRecorder';
import { reconcileCursor, runLocationUpload } from '../sync/locationUploader';
import { useTrackingStatus } from '../sync/locationTrackingStatus';

/** The UI-facing tracking control. Settings persist in mirror_meta (the recorder reads them from the
 *  data layer); live counters live in sync/locationTrackingStatus. This store owns the parts that
 *  need a user present: permissions, device registration, and the destructive actions. */

export type PermissionOutcome = 'granted' | 'foreground-only' | 'denied';

type TrackingState = {
  loaded: boolean;
  settings: TrackingSettings;
  registered: boolean;
  /** Background permission missing means tracking stops the moment the app is backgrounded. */
  backgroundGranted: boolean;
};

type TrackingActions = {
  init(): Promise<void>;
  /** Foreground permission only — enough for the live puck, not for recording. */
  requestForeground(): Promise<boolean>;
  /** Turns recording on: permissions → device registration → cursor repair → OS updates.
   *  Must be called from the foreground (Android won't start a foreground service otherwise). */
  enable(label: string): Promise<PermissionOutcome>;
  disable(): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  /** Retires this device server-side and drops the local queue. */
  unregister(): Promise<void>;
  /** Owner erase: deletes all server-side history plus anything still queued locally. */
  eraseHistory(): Promise<void>;
  /** Re-asserts reality on foreground: permissions may have been revoked, and an OEM battery manager
   *  (or a Play update replacing the package) can leave the service dead while the OS still reports
   *  it as started. Foreground-only by necessity — Android 12+ forbids starting a location foreground
   *  service from the background, which is exactly how it got wedged. */
  reconcile(): Promise<void>;
};

export const useLocationTracking = create<TrackingState & TrackingActions>((set, get) => ({
  loaded: false,
  settings: defaultTrackingSettings(),
  registered: false,
  backgroundGranted: false,

  init: async () => {
    const db = await getDb();
    await migrate(db, MIGRATIONS);
    const [settings, device, background] = await Promise.all([
      loadTrackingSettings(db),
      loadDevice(),
      Location.getBackgroundPermissionsAsync().catch(() => ({ granted: false })),
    ]);
    set({ settings, registered: device !== null, backgroundGranted: background.granted, loaded: true });
    useTrackingStatus.getState().set({ recording: await isRecording() });
    await useTrackingStatus.getState().refresh(db);
  },

  requestForeground: async () => {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted;
  },

  enable: async (label) => {
    // Android silently denies a combined request: foreground must be granted and settled BEFORE
    // background is asked for, and background opens the system settings page rather than a dialog.
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) return 'denied';

    // Android 13+: without this the foreground-service notification is invisible, which makes
    // continuous recording look like something the app is hiding.
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
    }

    const background = await Location.requestBackgroundPermissionsAsync();
    set({ backgroundGranted: background.granted });

    await ensureDevice(label);
    set({ registered: true });

    const db = await getDb();
    const settings = { ...get().settings, enabled: true, paused: false };
    await saveTrackingSettings(db, settings);
    set({ settings });

    await reconcileCursor(db);
    await startRecording();
    return background.granted ? 'granted' : 'foreground-only';
  },

  disable: async () => {
    await stopRecording();
    const db = await getDb();
    const settings = { ...get().settings, enabled: false };
    await saveTrackingSettings(db, settings);
    set({ settings });
    // Whatever is already queued still belongs on the server — drain it rather than dropping it.
    void runLocationUpload(db);
  },

  setPaused: async (paused) => {
    const db = await getDb();
    const settings = { ...get().settings, paused };
    await saveTrackingSettings(db, settings);
    set({ settings });
    if (paused) await stopRecording();
    else if (settings.enabled) await startRecording();
  },

  unregister: async () => {
    await stopRecording();
    await forgetDevice();
    const db = await getDb();
    // Queued fixes are unsendable once the key is gone — a new device would re-issue their seqs.
    await db.exclusive((tx) => clearQueue(tx));
    const settings = { ...get().settings, enabled: false };
    await saveTrackingSettings(db, settings);
    set({ settings, registered: false });
    await useTrackingStatus.getState().refresh(db);
  },

  reconcile: async () => {
    const [settings, background, running] = await Promise.all([
      loadTrackingSettings(await getDb()),
      Location.getBackgroundPermissionsAsync().catch(() => ({ granted: false })),
      isRecording(),
    ]);
    set({ settings, backgroundGranted: background.granted });
    useTrackingStatus.getState().set({ recording: running });

    if (!settings.enabled || settings.paused) return;
    const foreground = await Location.getForegroundPermissionsAsync().catch(() => ({ granted: false }));
    if (!foreground.granted) {
      await stopRecording();
      return;
    }
    if (!running) await startRecording();
    void runLocationUpload();
  },

  eraseHistory: async () => {
    await purgeLocationHistory();
    const db = await getDb();
    await db.exclusive((tx) => clearQueue(tx));
    await useTrackingStatus.getState().refresh(db);
  },
}));
