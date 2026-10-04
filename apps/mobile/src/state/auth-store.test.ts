import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.0.0' } } }));
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
vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));
vi.mock('@sentry/react-native', () => ({ setUser: vi.fn() }));
vi.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: vi.fn(() => Promise.resolve('hash')) }));

const refreshTokensMock = vi.fn();
vi.mock('../data/auth/oidc', () => ({ oidc: { refreshTokens: (rt: string) => refreshTokensMock(rt) } }));
vi.mock('@danbro96/lupira-expo-oidc/oidc', () => {
  class RefreshError extends Error {
    constructor(readonly definitive: boolean, message: string) {
      super(message);
    }
  }
  return { RefreshError, decodeJwt: () => ({ email: 'user@test' }) };
});

import { RefreshError } from '@danbro96/lupira-expo-oidc/oidc';
import { useAuth } from './auth-store';

function seedSession(expiresInMs: number) {
  useAuth.setState({
    loaded: true,
    authMode: 'oidc',
    token: 'tok-1',
    refreshToken: 'rt-1',
    expiresAt: Date.now() + expiresInMs,
    user: { sub: 'user@test' },
  });
}

beforeEach(() => {
  store.clear();
  refreshTokensMock.mockReset();
  useAuth.setState({ loaded: false, token: null, refreshToken: null, expiresAt: 0, user: null, authMode: 'oidc' });
});

describe('refreshIfNeeded', () => {
  it('stands pat on a fresh token without a forced refresh', async () => {
    seedSession(3_600_000);
    expect(await useAuth.getState().refreshIfNeeded()).toBe('tok-1');
    expect(refreshTokensMock).not.toHaveBeenCalled();
  });

  it('coalesces concurrent refreshes into one token-endpoint call', async () => {
    seedSession(10_000);   // inside the expiry margin → both callers want a refresh
    let release!: (v: unknown) => void;
    refreshTokensMock.mockReturnValue(new Promise((r) => { release = r; }));

    const a = useAuth.getState().refreshIfNeeded();
    const b = useAuth.getState().refreshIfNeeded();
    release({ accessToken: 'tok-2', refreshToken: 'rt-2', expiresIn: 3600 });

    expect(await a).toBe('tok-2');
    expect(await b).toBe('tok-2');
    expect(refreshTokensMock).toHaveBeenCalledTimes(1);
  });

  it('is rotation-safe: a 401 about an already-replaced token does not rotate again', async () => {
    seedSession(3_600_000);
    useAuth.setState({ token: 'tok-2', refreshToken: 'rt-2' });   // someone already rotated past tok-1

    const result = await useAuth.getState().refreshIfNeeded({ force: true, sentToken: 'tok-1' });
    expect(result).toBe('tok-2');
    expect(refreshTokensMock).not.toHaveBeenCalled();
  });

  it('coalesces concurrent forced refreshes and lets a late 401 on the old token skip rotation', async () => {
    seedSession(3_600_000);
    let release!: (v: unknown) => void;
    refreshTokensMock.mockReturnValue(new Promise((r) => { release = r; }));

    const a = useAuth.getState().refreshIfNeeded({ force: true, sentToken: 'tok-1' });
    const b = useAuth.getState().refreshIfNeeded({ force: true, sentToken: 'tok-1' });
    release({ accessToken: 'tok-2', refreshToken: 'rt-2', expiresIn: 3600 });
    expect(await a).toBe('tok-2');
    expect(await b).toBe('tok-2');

    expect(await useAuth.getState().refreshIfNeeded({ force: true, sentToken: 'tok-1' })).toBe('tok-2');
    expect(refreshTokensMock).toHaveBeenCalledTimes(1);
    expect(refreshTokensMock).toHaveBeenCalledWith('rt-1');
  });

  it('clears the session on a definitive failure', async () => {
    seedSession(10_000);
    await useAuth.getState().setSession({ accessToken: 'tok-1', refreshToken: 'rt-1', expiresIn: 10 });
    refreshTokensMock.mockRejectedValue(new RefreshError(true, 'invalid_grant'));

    expect(await useAuth.getState().refreshIfNeeded({ force: true })).toBeNull();
    expect(useAuth.getState().token).toBeNull();
    expect(useAuth.getState().refreshToken).toBeNull();
    expect(useAuth.getState().user).toBeNull();
    expect([...store.keys()]).toEqual([]);
  });

  it('signs out on a forced refresh with no refresh token, but not on a proactive one', async () => {
    seedSession(10_000);
    useAuth.setState({ refreshToken: null });

    expect(await useAuth.getState().refreshIfNeeded()).toBe('tok-1');
    expect(useAuth.getState().token).toBe('tok-1');
    expect(await useAuth.getState().refreshIfNeeded({ force: true })).toBeNull();
    expect(useAuth.getState().token).toBeNull();
    expect(refreshTokensMock).not.toHaveBeenCalled();
  });

  it('keeps the session on a transient failure and returns the same token', async () => {
    seedSession(10_000);
    refreshTokensMock.mockRejectedValue(new RefreshError(false, '503'));

    expect(await useAuth.getState().refreshIfNeeded({ force: true })).toBe('tok-1');
    expect(useAuth.getState().token).toBe('tok-1');
    expect(useAuth.getState().refreshToken).toBe('rt-1');
  });

  it('allows a new refresh after a failed one settles', async () => {
    seedSession(10_000);
    refreshTokensMock.mockRejectedValueOnce(new RefreshError(false, '503'));
    refreshTokensMock.mockResolvedValueOnce({ accessToken: 'tok-2', refreshToken: 'rt-2', expiresIn: 3600 });

    expect(await useAuth.getState().refreshIfNeeded({ force: true })).toBe('tok-1');
    expect(await useAuth.getState().refreshIfNeeded({ force: true })).toBe('tok-2');
    expect(refreshTokensMock).toHaveBeenCalledTimes(2);
  });

  it('sends nothing in dev auto-auth mode', async () => {
    useAuth.setState({ loaded: true, authMode: 'dev', token: null, refreshToken: null });
    expect(await useAuth.getState().refreshIfNeeded({ force: true })).toBeNull();
    expect(refreshTokensMock).not.toHaveBeenCalled();
  });
});

describe('session persistence', () => {
  it('stores the session under the lupira.calendar keys', async () => {
    useAuth.setState({ loaded: true, authMode: 'oidc' });
    await useAuth.getState().setSession({ accessToken: 'tok-9', refreshToken: 'rt-9', expiresIn: 3600 });

    expect([...store.keys()].sort()).toEqual([
      'lupira.calendar.expiresAt',
      'lupira.calendar.refreshToken',
      'lupira.calendar.token',
      'lupira.calendar.userSub',
    ]);
    expect(store.get('lupira.calendar.token')).toBe('tok-9');
    expect(store.get('lupira.calendar.refreshToken')).toBe('rt-9');
  });

  it('round-trips a session through the secure store', async () => {
    useAuth.setState({ loaded: true, authMode: 'oidc' });
    await useAuth.getState().setSession({ accessToken: 'tok-9', refreshToken: 'rt-9', expiresIn: 3600 });

    useAuth.setState({ loaded: false, token: null, refreshToken: null, expiresAt: 0, user: null });
    await useAuth.getState().load();

    const s = useAuth.getState();
    expect(s.token).toBe('tok-9');
    expect(s.refreshToken).toBe('rt-9');
    expect(s.user?.sub).toBe('user@test');
  });

  it('keeps the previous refresh token when the endpoint rotates without issuing one', async () => {
    seedSession(10_000);
    refreshTokensMock.mockResolvedValue({ accessToken: 'tok-2', refreshToken: null, expiresIn: 3600 });

    await useAuth.getState().refreshIfNeeded({ force: true });
    expect(useAuth.getState().refreshToken).toBe('rt-1');
  });
});
