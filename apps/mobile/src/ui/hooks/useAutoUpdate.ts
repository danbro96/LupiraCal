import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useAutoUpdate(): void {
  const { isUpdatePending } = Updates.useUpdates();
  const busy = useRef(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    if (isUpdatePending) void Updates.reloadAsync();
  }, [isUpdatePending]);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    const check = async () => {
      const now = Date.now();
      if (busy.current || now - lastCheck.current < CHECK_INTERVAL_MS) return;
      busy.current = true;
      lastCheck.current = now;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch (e) {
        Sentry.addBreadcrumb({ category: 'updates', level: 'warning', message: String(e) });
      } finally {
        busy.current = false;
      }
    };

    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => sub.remove();
  }, []);
}
