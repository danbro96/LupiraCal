// The crypto polyfill MUST load before any module that mints a UUID (Hermes has no global crypto).
import '@danbro96/lupira-expo-oidc/crypto';
// Before App: the background sync task can run headlessly with no App component, and the generated
// clients resolve their transport at call time.
import './src/data/api/installTransport';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
