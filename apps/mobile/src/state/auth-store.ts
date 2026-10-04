import * as Sentry from '@sentry/react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { DEFAULT_API_URL, DEFAULT_AUTH_MODE, type AuthMode } from '../config';
import { setAuthPort } from '@danbro96/lupira-http/authPort';
import { API_URL_STORAGE_KEY } from '../config';
import { decodeJwt, type TokenSet } from '@danbro96/lupira-expo-oidc/oidc';
import { createTokenRefresher, secureSessionStore } from '@danbro96/lupira-expo-oidc/tokenSession';
import { oidc } from '../data/auth/oidc';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

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
  setSession(tokens: TokenSet): Promise<void>;
  clearSession(): Promise<void>;
  /** Coalesced, rotation-safe refresh. */
  refreshIfNeeded(opts?: { force?: boolean; sentToken?: string }): Promise<string | null>;
  isAuthenticated(): boolean;
};

const K = {
  apiUrl: API_URL_STORAGE_KEY,
  authMode: 'lupira.calendar.authMode',
  userSub: 'lupira.calendar.userSub',
  userName: 'lupira.calendar.userName',
} as const;

const sessionStore = secureSessionStore('lupira.calendar');

const signInListeners = new Set<() => void>();

const claim = (claims: Record<string, unknown>, ...names: string[]): string | undefined =>
  names.map((n) => claims[n]).find((v): v is string => typeof v === 'string');

export const useAuth = create<AuthState & AuthActions>((set, get) => ({
  loaded: false,
  apiUrl: DEFAULT_API_URL,
  authMode: DEFAULT_AUTH_MODE,
  token: null,
  refreshToken: null,
  expiresAt: 0,
  user: null,

  async load() {
    const [apiUrl, authMode, userSub, userName, session] = await Promise.all([
      SecureStore.getItemAsync(K.apiUrl),
      SecureStore.getItemAsync(K.authMode),
      SecureStore.getItemAsync(K.userSub),
      SecureStore.getItemAsync(K.userName),
      sessionStore.load(),
    ]);
    set({
      loaded: true,
      apiUrl: apiUrl || DEFAULT_API_URL,
      // 'none' is the pre-rename value — without this it falls back to OIDC on a dev backend.
      authMode: authMode === 'none' ? 'dev' : ((authMode as AuthMode | null) ?? DEFAULT_AUTH_MODE),
      token: session.token,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
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
      const email = claim(c, 'email', 'preferred_username');
      const sub = claim(c, 'sub');
      return email || sub ? { sub: email ?? sub!, name: claim(c, 'name', 'given_name') } : get().user;
    })();
    const expiresAt = Date.now() + (t.expiresIn ?? 3600) * 1000;
    // In-memory FIRST: a rotated refresh token must survive a persistence failure or the session is stranded.
    set({ token: t.accessToken, refreshToken: t.refreshToken ?? get().refreshToken, expiresAt, user });
    void setSentryUser(user?.sub ?? null);
    const s = get();
    await Promise.all([
      sessionStore.save({ token: s.token, refreshToken: s.refreshToken, expiresAt }),
      s.user ? SecureStore.setItemAsync(K.userSub, s.user.sub) : Promise.resolve(),
      s.user?.name ? SecureStore.setItemAsync(K.userName, s.user.name) : Promise.resolve(),
    ]);
    if (!hadToken) for (const cb of signInListeners) cb();
  },

  async clearSession() {
    set({ token: null, refreshToken: null, expiresAt: 0, user: null });
    void setSentryUser(null);
    await Promise.all([
      sessionStore.clear(),
      SecureStore.deleteItemAsync(K.userSub),
      SecureStore.deleteItemAsync(K.userName),
    ]);
  },

  refreshIfNeeded(opts) {
    return get().authMode === 'dev' ? Promise.resolve(get().token) : refresh(opts);
  },

  isAuthenticated() {
    const s = get();
    return s.authMode === 'dev' || s.token !== null;
  },
}));

const refresh = createTokenRefresher({
  read: () => {
    const { token, refreshToken, expiresAt } = useAuth.getState();
    return { token, refreshToken, expiresAt };
  },
  refreshTokens: (refreshToken) => oidc.refreshTokens(refreshToken),
  apply: (t) => useAuth.getState().setSession(t),
  signOut: () => useAuth.getState().clearSession(),
  log: logDebug,
});

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
