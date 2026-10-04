import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { runLocationUpload } from './locationUploader';
import { runSync } from './sync';

/** Best-effort while-backgrounded freshness: WorkManager's 15-minute floor, further throttled by Doze and
 *  app-standby buckets — in practice hours, not minutes. Foreground triggers remain the real freshness path;
 *  this keeps the mirror from going stale over a long idle stretch.
 *
 *  runSync kicks the camera-roll backup as its last step, so a background tick also drains a few queued
 *  assets. That makes background backup catch-up, NOT a Google-Photos-grade instant upload: the task's
 *  ~30 s budget fits a handful of photos, and a video may need several ticks (each retry resumes from the
 *  queue, so no work is lost). Bulk backup happens while the app is open. */
const TASK_NAME = 'lupira-calendar-sync';

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await runSync();
    // Recorded fixes shouldn't sit in the queue until the app is next opened — the location
    // foreground service keeps writing them whether or not anyone is looking at the app.
    await runLocationUpload();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    logDebug('sync', `background sync failed: ${String(e)}`);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 15 });
    logDebug('sync', 'background sync registered');
  } catch (e) {
    // Unavailable in Expo Go / misconfigured devices — foreground sync still covers everything.
    logDebug('sync', `background sync unavailable: ${String(e)}`);
  }
}
