import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getDb } from '../data/db/expoDb';
import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import { MIGRATIONS } from '../data/db/schema';
import { getMeta, setMeta } from '../data/mirror';
import { enqueueFix } from '../data/locationQueue';
import { loadTrackingSettings } from '../data/locationSettings';
import {
  CADENCE, MAX_USEFUL_ACCURACY_M, classifyActivity, isTimestampAcceptable, nextCadence,
  type MotionActivity,
} from '../domain/locationFix';
import { batteryPct } from '../data/battery';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { runLocationUpload } from './locationUploader';
import { useTrackingStatus } from './locationTrackingStatus';

/** The recorder: OS location updates → SQLite queue. Runs under a foreground service so it survives
 *  the app being backgrounded; the uploader drains separately.
 *
 *  Cadence adapts to how fast you're moving, but expo-location can't change options in place — a new
 *  profile means stop+start. `nextCadence` gates that behind a streak so a single noisy fix can't
 *  thrash the OS subscription. */

const TASK_NAME = 'lupira-location-track';
const CADENCE_KEY = 'location.cadence';

/** Cadence survives restarts so the recorder resumes at the profile it was using, not at Unknown. */
type CadenceState = { activity: MotionActivity; streakActivity: MotionActivity; streak: number };

async function loadCadence(): Promise<CadenceState> {
  const db = await getDb();
  const stored = await db.exclusive((tx) => getMeta(tx, CADENCE_KEY));
  return stored
    ? (JSON.parse(stored) as CadenceState)
    : { activity: 'Unknown', streakActivity: 'Unknown', streak: 0 };
}

async function saveCadence(state: CadenceState): Promise<void> {
  const db = await getDb();
  await db.exclusive((tx) => setMeta(tx, CADENCE_KEY, JSON.stringify(state)));
}

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error) {
    logDebug('location', `task error: ${error.message}`);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  if (locations.length === 0) return;

  try {
    await recordFixes(locations);
  } catch (e) {
    logDebug('location', `record failed: ${String(e)}`);
  }
});

async function recordFixes(locations: Location.LocationObject[]): Promise<void> {
  const db = await getDb();
  await migrate(db, MIGRATIONS);   // the task can run before any UI has mounted

  const settings = await loadTrackingSettings(db);
  if (!settings.enabled || settings.paused) return;

  const now = Date.now();
  // Read once per batch, not per fix — the server only surfaces it on /location/current anyway.
  const battery = await batteryPct();
  let observed: MotionActivity = 'Unknown';

  await db.exclusive(async (tx) => {
    for (const location of locations) {
      const ts = new Date(location.timestamp).toISOString();
      // A fix the server would reject outright is never worth queue space.
      if (!isTimestampAcceptable(ts, now)) continue;
      const accuracy = location.coords.accuracy;
      // Above this the server drops the fix from stats AND the visit/trip rollup — it would upload
      // as dead weight and could not produce a visit.
      if (accuracy != null && accuracy > MAX_USEFUL_ACCURACY_M) continue;

      const activity = classifyActivity(location.coords.speed);
      observed = activity;
      await enqueueFix(tx, {
        ts,
        lat: location.coords.latitude,
        lon: location.coords.longitude,
        accuracyM: accuracy,
        altitudeM: location.coords.altitude,
        headingDeg: location.coords.heading,
        speedMps: location.coords.speed,
        activity,
        provider: 'Fused',
        batteryPct: battery,
        isMoving: activity !== 'Still' && activity !== 'Unknown',
        isMock: location.mocked === true,
      });
    }
  });

  await useTrackingStatus.getState().refresh(db);
  await applyCadence(observed);
  void runLocationUpload(db);
}

/** Restarts OS updates when the activity class has genuinely changed. */
async function applyCadence(observed: MotionActivity): Promise<void> {
  if (observed === 'Unknown') return;
  const state = await loadCadence();
  const decision = nextCadence(state.activity, state.streakActivity, state.streak, observed);
  await saveCadence({ activity: decision.activity, streakActivity: observed, streak: decision.streak });
  if (!decision.restart) return;

  logDebug('location', `cadence → ${decision.activity}`);
  // Deliberately NOT stop-then-start: calling start again on a live task reconfigures the location
  // request in place and leaves the foreground service up. Stopping first would mean re-starting a
  // location FGS from the background, which Android 12+ forbids outright.
  await startUpdates(decision.activity);
}

async function startUpdates(activity: MotionActivity): Promise<void> {
  const profile = CADENCE[activity];
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    // High in every profile, including Still — see the CADENCE comment: Balanced (~100 m) sits above
    // the server's 50 m cutoff and would silently produce zero visits.
    accuracy: Location.Accuracy.High,
    timeInterval: profile.timeIntervalMs,
    distanceInterval: profile.distanceIntervalM,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Lupira is recording your route',
      notificationBody: 'Tap to open. Turn off in Settings → Location tracking.',
      killServiceOnDestroy: false,
    },
  });
}

export async function isRecording(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(TASK_NAME);
}

/** Arms tracking. MUST be called from the foreground: Android refuses to start a foreground service
 *  for a backgrounded app. Assumes permissions are already granted (see the tracking store). */
export async function startRecording(): Promise<void> {
  if (await isRecording()) return;
  const state = await loadCadence();
  await startUpdates(state.activity);
  useTrackingStatus.getState().set({ recording: true });
  logDebug('location', 'recording started');
}

export async function stopRecording(): Promise<void> {
  if (await isRecording()) await Location.stopLocationUpdatesAsync(TASK_NAME);
  useTrackingStatus.getState().set({ recording: false });
  logDebug('location', 'recording stopped');
}
