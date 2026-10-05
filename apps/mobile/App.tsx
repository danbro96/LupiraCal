import type { LinkingOptions } from '@react-navigation/native';
import { NavigationContainer } from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from './src/state/auth-store';
import { ConfirmDialogHost } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { ToastHost } from '@danbro96/lupira-expo-paper/components/ToastHost';
import { navDark, navLight, paperDark, paperLight } from './src/ui/theme/paperTheme';
import { useBridge } from './src/state/bridge-store';
import { usePrefs } from './src/state/prefs-store';
import { connectFocusManager } from '@danbro96/lupira-expo-query/focus';
import { connectOnlineManager } from '@danbro96/lupira-expo-query/online';
import { startSyncTriggers } from '@danbro96/lupira-sync-engine/expo/triggers';
import { engine, SYNC_TASK } from './src/sync/engine';
import { persistOptions, queryClient } from './src/sync/queryClient';
import { RootStack } from './src/ui/navigation/RootStack';
import { useAutoUpdate } from '@danbro96/lupira-expo-diagnostics/useAutoUpdate';
import type { RootStackParamList } from './src/ui/navigation/types';
import { paperSettings } from '@danbro96/lupira-expo-paper/theme/paperSettings';
import { SENTRY_DSN } from './src/config';
import { initSentry } from '@danbro96/lupira-expo-diagnostics/initSentry';

initSentry(SENTRY_DSN);
connectOnlineManager();
connectFocusManager();

export default function App() {
  useAutoUpdate();
  const scheme = useColorScheme();
  const loaded = useAuth((s) => s.loaded);
  const authed = useAuth((s) => s.authMode === 'dev' || s.token !== null);

  useEffect(() => {
    void useAuth.getState().load();
  }, []);

  useEffect(() => {
    if (!loaded || !authed) return;
    void useBridge.getState().init();   // hydrate the integration flag + self-repair account/permissions
    void usePrefs.getState().init();
    return startSyncTriggers(engine, { backgroundTaskName: SYNC_TASK });
  }, [loaded, authed]);

  if (!loaded) return null;   // hydration gate — avoids a login flash over a persisted session
  return (
    // GestureHandlerRootView must be the outermost view or the week view's pinch gesture never fires.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
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
      </PersistQueryClientProvider>
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
