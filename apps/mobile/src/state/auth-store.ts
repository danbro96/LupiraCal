import * as Sentry from '@sentry/react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { API_PRESETS, DEFAULT_API_URL, DEFAULT_AUTH_MODE, type AuthMode } from '../config';
import { setAuthPort } from '../data/api/authProvider';
import { API_URL_STORAGE_KEY } from '../config';
import { RefreshError, decodeJwt, refreshTokens, type TokenResponse } from '../data/auth/oidc';
import { logDebug } from '../debug/log';

export type AuthUser = { sub: string; name?: string };

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

type AuthState = {
  /** Hydration gate — the app renders nothing until the persisted session is loaded. */
  loaded: boolean;
  apiUrl: string;
  authMode: AuthMode;
  token: string | null;
  refreshToken: string | null;
  /** Epoch ms. */
  expiresAt: number;
  user: AuthUser | null;
};

type AuthActions = {
  load(): Promise<void>;
  /** Switch backend (settings screen). Clears the session — a token minted for one backend is meaningless
   *  against another, and the LAN mode sends none at all. */
  setBackend(urls: Record<string, string>, authMode: AuthMode): Promise<void>;
  setSession(tokens: TokenResponse): Promise<void>;
  clearSession(): Promise<void>;
  /** Coalesced, rotation-safe refresh — see the state walk-through inline. */
  refreshIfNeeded(opts?: { force?: boolean; sentToken?: string }): Promise<string | null>;
  isAuthenticated(): boolean;
};

const K = {
  apiUrl: API_URL_STORAGE_KEY,
  authMode: 'lupira.calendar.authMode',
  token: 'lupira.calendar.token',
  refreshToken: 'lupira.calendar.refreshToken',
  expiresAt: 'lupira.calendar.expiresAt',
  userSub: 'lupira.calendar.userSub',
  userName: 'lupira.calendar.userName',
} as const;

/** Refresh this many ms before nominal expiry so an in-flight request never races the boundary. */
const EXPIRY_MARGIN_MS = 60_000;

// Single-flight: the first refresher owns the POST, concurrent callers await the same promise. With
// Authentik refresh-token rotation, a second concurrent POST replays an already-rotated token and the
// provider treats it as theft — forced logout. Module-level so it survives store updates.
let refreshing: Promise<string | null> | null = null;

const signInListeners = new Set<() => void>();

export const useAuth = create<AuthState & AuthActions>((set, get) => ({
  loaded: false,
  apiUrl: DEFAULT_API_URL,
  authMode: DEFAULT_AUTH_MODE,
  token: null,
  refreshToken: null,
  expiresAt: 0,
  user: null,

  async load() {
    const [apiUrl, authMode, token, refreshToken, expiresAt, userSub, userName] = await Promise.all(
      Object.values(K).map((k) => SecureStore.getItemAsync(k)),
    );
    set({
      loaded: true,
      apiUrl: apiUrl || DEFAULT_API_URL,
      // 'none' is the pre-rename value — without this it falls back to OIDC on a dev backend.
      authMode: authMode === 'none' ? 'dev' : ((authMode as AuthMode | null) ?? DEFAULT_AUTH_MODE),
      token: token || null,
      refreshToken: refreshToken || null,
      expiresAt: expiresAt ? Number(expiresAt) : 0,
      user: userSub ? { sub: userSub, name: userName || undefined } : null,
    });
    void setSentryUser(userSub || null);
  },

  async setBackend(urls, authMode) {
    await get().clearSession();
    const url = urls.api;
    set({ apiUrl: url, authMode });
    await SecureStore.setItemAsync(K.apiUrl, url);
    await SecureStore.setItemAsync(K.authMode, authMode);
    logDebug('auth', `backend → ${url} (${authMode})`);
    if (authMode === 'dev') for (const cb of signInListeners) cb();
  },

  async setSession(t) {
    const hadToken = get().token !== null;
    const user = ((): AuthUser | null => {
      const c = decodeJwt(t.accessToken);
      return c.email || c.sub ? { sub: c.email ?? c.sub!, name: c.name } : get().user;
    })();
    const expiresAt = Date.now() + (t.expiresIn ?? 3600) * 1000;
    // In-memory FIRST: a rotated refresh token must survive a persistence failure or the session is stranded.
    set({ token: t.accessToken, refreshToken: t.refreshToken ?? get().refreshToken, expiresAt, user });
    void setSentryUser(user?.sub ?? null);
    const s = get();
    await Promise.all([
      SecureStore.setItemAsync(K.token, s.token!),
      s.refreshToken ? SecureStore.setItemAsync(K.refreshToken, s.refreshToken) : Promise.resolve(),
      SecureStore.setItemAsync(K.expiresAt, String(expiresAt)),
      s.user ? SecureStore.setItemAsync(K.userSub, s.user.sub) : Promise.resolve(),
      s.user?.name ? SecureStore.setItemAsync(K.userName, s.user.name) : Promise.resolve(),
    ]);
    if (!hadToken) for (const cb of signInListeners) cb();
  },

  async clearSession() {
    set({ token: null, refreshToken: null, expiresAt: 0, user: null });
    void setSentryUser(null);
    await Promise.all([K.token, K.refreshToken, K.expiresAt, K.userSub, K.userName]
      .map((k) => SecureStore.deleteItemAsync(k)));
  },

  async refreshIfNeeded(opts) {
    const { token, refreshToken, expiresAt, authMode } = get();
    if (authMode === 'dev' || !token) return token;

    // Another caller already rotated past the token this 401 was about — don't rotate again.
    if (opts?.force && opts.sentToken && opts.sentToken !== token) return token;

    const fresh = Date.now() < expiresAt - EXPIRY_MARGIN_MS;
    if (fresh && !opts?.force) return token;

    if (!refreshToken) {
      if (opts?.force) {
        logDebug('auth', 'forced refresh with no refresh token — signing out');
        await get().clearSession();
        return null;
      }
      return token;   // proactive caller: limp along on the stale token
    }

    refreshing ??= (async () => {
      try {
        const t = await refreshTokens(refreshToken);
        await get().setSession(t);
        logDebug('auth', 'token refreshed');
        return get().token;
      } catch (e) {
        if (e instanceof RefreshError && e.definitive) {
          logDebug('auth', `definitive refresh failure — signing out (${e.message})`);
          await get().clearSession();
          return null;
        }
        logDebug('auth', `transient refresh failure — keeping session (${String(e)})`);
        return get().token;   // same token back: callers see "nothing rotated"
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  },

  isAuthenticated() {
    const s = get();
    return s.authMode === 'dev' || s.token !== null;
  },
}));

export function onSignIn(cb: () => void): () => void {
  signInListeners.add(cb);
  return () => signInListeners.delete(cb);
}

// The data layer reaches the live session through this port (downward-only imports stay intact).
setAuthPort({
  getApiUrl: () => useAuth.getState().apiUrl,
  getToken: () => (useAuth.getState().authMode === 'dev' ? null : useAuth.getState().token),
  refresh: (force, sentToken) => useAuth.getState().refreshIfNeeded({ force, sentToken }),
  onSignIn,
});

export function presetFor(url: string, authMode: AuthMode): string {
  return API_PRESETS.find((p) => p.urls.api === url && p.authMode === authMode)?.key ?? 'custom';
}
