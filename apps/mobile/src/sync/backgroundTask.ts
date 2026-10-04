import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { runSync } from './sync';

/** Best-effort while-backgrounded freshness: WorkManager's 15-minute floor, further throttled by Doze and
 *  app-standby buckets — in practice hours, not minutes. Foreground triggers remain the real freshness path;
 *  this keeps the mirror from going stale over a long idle stretch. */
const TASK_NAME = 'lupira-calendar-sync';

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await runSync();
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
