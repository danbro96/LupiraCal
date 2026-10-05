import * as Sentry from '@sentry/react-native';
import * as Crypto from 'expo-crypto';
import { createAuthStore } from '@danbro96/lupira-expo-oidc/authStore';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { DEFAULT_API_URL, DEFAULT_AUTH_MODE } from '../config';
import { oidc } from '../data/auth/oidc';
import { engine } from '../sync/engine';
import { queryClient } from '../sync/queryClient';

/** Pseudonymous Sentry identity: SHA-256 of the email (sendDefaultPii is off). Null clears it. */
async function setSentryUser(sub: string | null): Promise<void> {
  if (!sub) {
    Sentry.setUser(null);
    return;
  }
  try {
    Sentry.setUser({ id: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, sub) });
  } catch {
    // Leave it unset rather than risk sending the raw email.
  }
}

export const useAuth = createAuthStore({
  keyPrefix: 'lupira.calendar',
  defaultApiUrl: DEFAULT_API_URL,
  defaultAuthMode: DEFAULT_AUTH_MODE,
  oidc,
  log: logDebug,
  onAccountChange: async () => {
    await engine.wipe();
    queryClient.clear();
  },
});

useAuth.subscribe((s, prev) => {
  if (s.user?.sub !== prev.user?.sub) void setSentryUser(s.user?.sub ?? null);
});
