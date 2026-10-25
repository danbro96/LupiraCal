// The crypto polyfill MUST load before any module that mints a UUID (Hermes has no global crypto).
import '@danbro96/lupira-expo-oidc/crypto';
// Before App: the background sync task can run headlessly with no App component, and the generated
// clients resolve their transport at call time.
import './src/data/api/installTransport';
import { defineSyncTask } from '@danbro96/lupira-sync-engine/expo/triggers';
import { registerRootComponent } from 'expo';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import App from './App';
import { tapOf } from './src/data/notifications/port';
import { useAuth } from './src/state/auth-store';
import { NOTIFICATION_TASK, respondToNotification } from './src/state/notificationResponses';
import { engine, notifications, SYNC_TASK } from './src/sync/engine';

// Module scope: the OS runs the background task headlessly where App never mounts, so it loads the session itself.
// The reconcile is awaited here: the debounced one after the pull may never fire before the task ends.
defineSyncTask(SYNC_TASK, {
  sync: async () => {
    await engine.sync();
    await notifications.reconcile();
  },
}, async () => {
  await useAuth.getState().load();
  return useAuth.getState().isAuthenticated();
});

// RSVP buttons tapped while the app is in the background or killed arrive here, not at App's listener.
TaskManager.defineTask<Notifications.NotificationTaskPayload>(NOTIFICATION_TASK, async ({ data }) => {
  if (!data || !('actionIdentifier' in data)) return;
  await useAuth.getState().load();
  if ((await respondToNotification(tapOf(data))) === 'answered') await notifications.reconcile();
});
Notifications.registerTaskAsync(NOTIFICATION_TASK).catch(() => undefined);
registerRootComponent(App);
