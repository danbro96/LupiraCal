import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
  setItemAsync: vi.fn((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((k: string) => {
    store.delete(k);
    return Promise.resolve();
  }),
}));
vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn(), detach: vi.fn() }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock('@sentry/react-native', () => ({ setUser: vi.fn() }));
vi.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: vi.fn(() => Promise.resolve('hash')) }));
vi.mock('../data/auth/oidc', () => ({ oidc: { refreshTokens: vi.fn() } }));
vi.mock('@danbro96/lupira-expo-oidc/oidc', () => ({ decodeJwt: (t: string) => ({ email: t }) }));
const { order, wipe, resetBridge, cancelAll, clear } = vi.hoisted(() => {
  const order: string[] = [];
  const step = (name: string) => vi.fn(() => {
    order.push(name);
    return Promise.resolve();
  });
  return { order, wipe: step('wipe'), resetBridge: step('resetBridge'), cancelAll: step('cancelAll'), clear: step('clear') };
});
vi.mock('../sync/engine', () => ({ engine: { wipe }, notifications: { cancelAll } }));
vi.mock('../sync/bridge', () => ({ resetBridge }));
vi.mock('../sync/queryClient', () => ({ queryClient: { clear } }));

const { useAuth } = await import('./auth-store');

beforeEach(async () => {
  store.clear();
  wipe.mockClear();
  resetBridge.mockClear();
  order.length = 0;
  await useAuth.getState().load();
});

describe('auth store', () => {
  it('persists the session under the app prefix and wipes the mirror only when the account changes', async () => {
    await useAuth.getState().setSession({ accessToken: 'anna@test', refreshToken: 'rt', expiresIn: 3600 });
    expect(store.get('lupira.calendar.userSub')).toBe('anna@test');
    expect(wipe).toHaveBeenCalledTimes(1);

    await useAuth.getState().clearSession();
    await useAuth.getState().setSession({ accessToken: 'anna@test', expiresIn: 3600 });
    expect(wipe).toHaveBeenCalledTimes(1);

    await useAuth.getState().clearSession();
    await useAuth.getState().setSession({ accessToken: 'bo@test', expiresIn: 3600 });
    expect(wipe).toHaveBeenCalledTimes(2);
  });

  it('empties the stock apps after the mirror and before the cache on an account change', async () => {
    await useAuth.getState().setSession({ accessToken: 'anna@test', expiresIn: 3600 });
    expect(order).toEqual(['cancelAll', 'wipe', 'resetBridge', 'clear']);
  });

  it('empties the stock apps on sign-out but not when the session expires', async () => {
    await useAuth.getState().setSession({ accessToken: 'anna@test', expiresIn: 3600 });
    resetBridge.mockClear();

    await useAuth.getState().clearSession({ reason: 'expired' });
    expect(resetBridge).not.toHaveBeenCalled();

    await useAuth.getState().setSession({ accessToken: 'anna@test', expiresIn: 3600 });
    await useAuth.getState().clearSession();
    expect(resetBridge).toHaveBeenCalledTimes(1);
  });
});
