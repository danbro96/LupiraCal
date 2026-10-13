import type { LinkingOptions } from '@react-navigation/native';
import { NavigationContainer } from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import * as Notifications from 'expo-notifications';
import { AppState, Linking, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, Text } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from './src/state/auth-store';
import { ConfirmDialogHost } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { ToastHost } from '@danbro96/lupira-expo-paper/components/ToastHost';
import { navDark, navLight, paperDark, paperLight } from './src/ui/theme/paperTheme';
import { useColors } from './src/ui/theme';
import { useBridge } from './src/state/bridge-store';
import { usePrefs } from './src/state/prefs-store';
import { connectFocusManager } from '@danbro96/lupira-expo-query/focus';
import { connectOnlineManager } from '@danbro96/lupira-expo-query/online';
import { startSyncTriggers } from '@danbro96/lupira-sync-engine/expo/triggers';
import { engine, notifications, SYNC_TASK } from './src/sync/engine';
import { bodyTapUrl, tapOf } from './src/data/notifications/port';
import { showNotificationsInForeground } from './src/data/notifications/setup';
import { respondToNotification } from './src/state/notificationResponses';
import { persistOptions, queryClient } from './src/sync/queryClient';
import { RootStack } from './src/ui/navigation/RootStack';
import { clearImportFiles } from './src/data/imports';
import { useAutoUpdate } from '@danbro96/lupira-expo-diagnostics/useAutoUpdate';
import type { RootStackParamList } from './src/ui/navigation/types';
import { paperSettings } from '@danbro96/lupira-expo-paper/theme/paperSettings';
import { SENTRY_DSN } from './src/config';
import { initSentry } from '@danbro96/lupira-expo-diagnostics/initSentry';

initSentry(SENTRY_DSN);
connectOnlineManager();
connectFocusManager();
showNotificationsInForeground();

/** Shown when the boundary catches (and reports) a render crash. */
function ErrorFallback() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.bg }}>
      <Text variant="titleMedium" style={{ color: c.text, marginBottom: 8 }}>Something went wrong</Text>
      <Text style={{ color: c.textMuted, textAlign: 'center' }}>
        The app hit an unexpected error. Please reopen it — your data is saved on this device.
      </Text>
    </View>
  );
}

export default function App() {
  useAutoUpdate();
  const scheme = useColorScheme();
  const loaded = useAuth((s) => s.loaded);
  const authed = useAuth((s) => s.authMode === 'dev' || s.token !== null);

  useEffect(() => {
    void useAuth.getState().load();
    void clearImportFiles();
  }, []);

  useEffect(() => {
    if (!loaded || !authed) return;
    void useBridge.getState().init();   // hydrate the integration flag + self-repair account/permissions
    void usePrefs.getState().init();
    void notifications.prepare();
    const active = AppState.addEventListener('change', (state) => {
      if (state === 'active') void notifications.reconcile();
    });
    const taps = Notifications.addNotificationResponseReceivedListener((r) => void respondToNotification(tapOf(r)));
    const stopSync = startSyncTriggers(engine, { backgroundTaskName: SYNC_TASK, registerBackgroundTask: !__DEV__ });
    return () => {
      active.remove();
      taps.remove();
      stopSync();
    };
  }, [loaded, authed]);

  if (!loaded) return null;   // hydration gate — avoids a login flash over a persisted session
  return (
    // GestureHandlerRootView must be the outermost view or the week view's pinch gesture never fires.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <SafeAreaProvider>
          <PaperProvider theme={scheme === 'dark' ? paperDark : paperLight} settings={paperSettings}>
            <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
              <ConfirmDialogHost>
                <NavigationContainer linking={linking} theme={scheme === 'dark' ? navDark : navLight}>
                  <StatusBar style="auto" />
                  <RootStack />
                </NavigationContainer>
              </ConfirmDialogHost>
            </Sentry.ErrorBoundary>
            <ToastHost />
          </PaperProvider>
        </SafeAreaProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

/// Deep links from the bridge's intent router and App Links (the web's paths are aliases). The OIDC
/// redirect (lupiracalendar://oauthredirect) matches nothing here and is ignored by navigation.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['lupiracalendar://', 'https://cal.lupira.com'],
  config: {
    screens: {
      ContactDetail: { path: 'contact/:contactId', alias: ['contacts/:contactId'] },
      ItemDetail: { path: 'item/:itemId', alias: ['items/:itemId'] },
      ItemEdit: { path: 'draft/event', alias: ['item/:itemId/edit'] },
      ContactEdit: 'draft/contact',
      Import: 'import/:kind',
    },
  },
  // A tap on a notification's body opens its deep link, from a cold start too.
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url) return url;
    const tapped = bodyTapUrl(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
    return tapped;
  },
  subscribe(listener) {
    const links = Linking.addEventListener('url', ({ url }) => listener(url));
    const taps = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = bodyTapUrl(r);
      if (url) listener(url);
    });
    return () => {
      links.remove();
      taps.remove();
    };
  },
};
