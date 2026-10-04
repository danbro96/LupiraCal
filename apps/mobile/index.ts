// The crypto polyfill MUST load before any module that mints a UUID (Hermes has no global crypto).
import '@danbro96/lupira-expo-oidc/crypto';
// Before locationRecorder, not after: a headless restart runs that task with no App component, and
// the generated clients resolve their transport at call time.
import './src/data/api/installTransport';
// defineTask must run during bundle evaluation, not from a React effect: when the OS restarts the
// process headlessly to deliver background fixes there is no App component, and an unregistered task
// silently drops the batch.
import './src/sync/locationRecorder';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
