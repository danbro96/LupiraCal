import type { LinkingOptions } from '@react-navigation/native';
import { NavigationContainer } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from './src/state/auth-store';
import { ConfirmDialogHost } from './src/ui/components/ConfirmDialog';
import { ToastHost } from './src/ui/components/ToastHost';
import { navDark, navLight, paperDark, paperLight } from './src/ui/theme/paperTheme';
import { useBridge } from './src/state/bridge-store';
import { useLocationTracking } from './src/state/location-tracking-store';
import { usePhotoBackup } from './src/state/photo-backup-store';
import { usePrefs } from './src/state/prefs-store';
import { registerBackgroundSync } from './src/sync/backgroundTask';
import { queryClient } from './src/sync/reactivity';
import { startSync } from './src/sync/sync';
import { RootStack } from './src/ui/navigation/RootStack';
import type { RootStackParamList } from './src/ui/navigation/types';
import { paperSettings } from './src/ui/theme/paperSettings';
import { APP_VERSION, SENTRY_DSN } from './src/config';

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  release: APP_VERSION,
  dist: APP_VERSION,
  environment: __DEV__ ? 'development' : 'production',
});

export default function App() {
  const scheme = useColorScheme();
  const loaded = useAuth((s) => s.loaded);
  const authed = useAuth((s) => s.authMode === 'dev' || s.token !== null);

  useEffect(() => {
    void useAuth.getState().load();
  }, []);

  useEffect(() => {
    if (!loaded || !authed) return;
    void registerBackgroundSync();
    void useBridge.getState().init();   // hydrate the integration flag + self-repair account/permissions
    void usePrefs.getState().init();
    void usePhotoBackup.getState().init();
    void useLocationTracking.getState().init();

    // Tracking self-repair has to live here, not in sync's AppState hook: it may need to RESTART the
    // location foreground service, which Android only permits from the foreground, and the sync layer
    // can't reach the tracking store anyway (boundaries are one-way).
    const stopSync = startSync();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void useLocationTracking.getState().reconcile();
    });
    return () => {
      stopSync();
      appState.remove();
    };
  }, [loaded, authed]);

  if (!loaded) return null;   // hydration gate — avoids a login flash over a persisted session
  return (
    // GestureHandlerRootView must be the outermost view or the photo viewer's pinch gesture never fires.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <PaperProvider theme={scheme === 'dark' ? paperDark : paperLight} settings={paperSettings}>
            <ConfirmDialogHost>
              <NavigationContainer linking={linking} theme={scheme === 'dark' ? navDark : navLight}>
                <StatusBar style="auto" />
                <RootStack />
              </NavigationContainer>
            </ConfirmDialogHost>
            <ToastHost />
          </PaperProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/// Deep links from the OS bridges ("Open in Lupira" contact rows, later calendar rows). The OIDC
/// redirect (lupiracalendar://oauthredirect) matches nothing here and is ignored by navigation.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['lupiracalendar://'],
  config: {
    screens: {
      ContactDetail: 'contact/:contactId',
      ItemDetail: 'item/:itemId',
    },
  },
};
