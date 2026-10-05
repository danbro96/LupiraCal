// The crypto polyfill MUST load before any module that mints a UUID (Hermes has no global crypto).
import '@danbro96/lupira-expo-oidc/crypto';
// Before App: the background sync task can run headlessly with no App component, and the generated
// clients resolve their transport at call time.
import './src/data/api/installTransport';
import { defineSyncTask } from '@danbro96/lupira-sync-engine/expo/triggers';
import { registerRootComponent } from 'expo';
import App from './App';
import { useAuth } from './src/state/auth-store';
import { engine, SYNC_TASK } from './src/sync/engine';

// Module scope: the OS runs the background task headlessly where App never mounts, so it loads the session itself.
defineSyncTask(SYNC_TASK, engine, () => useAuth.getState().load());
registerRootComponent(App);
