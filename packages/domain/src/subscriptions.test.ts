import { describe, expect, it } from 'vitest';
import { canManageSubscriptions, isRefreshPending, isSubscribedOrigin, subscriptionStatus, type SubscriptionLike } from './subscriptions';

const now = new Date('2026-10-27T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
const sub = (over: Partial<SubscriptionLike>): SubscriptionLike => ({
  nextRefreshAt: '2026-10-27T13:00:00Z',
  ...over,
});

describe('isSubscribedOrigin', () => {
  it('matches subscription origins only', () => {
    expect(isSubscribedOrigin({ kind: 'Subscription' })).toBe(true);
    expect(isSubscribedOrigin({ kind: 'Birthday' })).toBe(false);
    expect(isSubscribedOrigin(null)).toBe(false);
    expect(isSubscribedOrigin(undefined)).toBe(false);
  });
});

describe('canManageSubscriptions', () => {
  it('allows owners only', () => {
    expect(canManageSubscriptions({ access: 'Owner' })).toBe(true);
    expect(canManageSubscriptions({ access: 'ReadWrite' })).toBe(false);
    expect(canManageSubscriptions({ access: 'Read' })).toBe(false);
    expect(canManageSubscriptions({})).toBe(false);
  });
});

describe('isRefreshPending', () => {
  it('is pending while the next refresh is due', () => {
    expect(isRefreshPending(sub({ nextRefreshAt: minutesAgo(1) }), now)).toBe(true);
    expect(isRefreshPending(sub({ nextRefreshAt: now.toISOString() }), now)).toBe(true);
    expect(isRefreshPending(sub({}), now)).toBe(false);
  });
});

describe('subscriptionStatus', () => {
  it('waits for the first sync', () => {
    expect(subscriptionStatus(sub({ nextRefreshAt: minutesAgo(0) }), now)).toEqual({ tone: 'pending', text: 'Waiting for first sync' });
    expect(subscriptionStatus(sub({}), now)).toEqual({ tone: 'pending', text: 'Waiting for first sync' });
  });

  it('says how long ago it synced', () => {
    expect(subscriptionStatus(sub({ lastSyncedAt: minutesAgo(0) }), now).text).toBe('Synced just now');
    expect(subscriptionStatus(sub({ lastSyncedAt: minutesAgo(5) }), now)).toEqual({ tone: 'ok', text: 'Synced 5 min ago' });
    expect(subscriptionStatus(sub({ lastSyncedAt: minutesAgo(180) }), now).text).toBe('Synced 3 h ago');
    expect(subscriptionStatus(sub({ lastSyncedAt: minutesAgo(60 * 24) }), now).text).toBe('Synced 1 day ago');
    expect(subscriptionStatus(sub({ lastSyncedAt: minutesAgo(60 * 72) }), now).text).toBe('Synced 3 days ago');
  });

  it('names each failure', () => {
    const text = (lastError: SubscriptionLike['lastError']) => subscriptionStatus(sub({ lastError, lastSyncedAt: minutesAgo(5) }), now);
    expect(text('Unreachable')).toEqual({ tone: 'error', text: "Address can't be reached" });
    expect(text('Rejected').text).toBe('Address refused access');
    expect(text('NotACalendar').text).toBe('Not a calendar');
    expect(text('TooLarge').text).toBe('Too large');
    expect(text('Blocked').text).toBe('Address not allowed');
  });

  it('shows a requested refresh over the last result', () => {
    expect(subscriptionStatus(sub({ nextRefreshAt: minutesAgo(0), lastSyncedAt: minutesAgo(30) }), now)).toEqual({ tone: 'pending', text: 'Refreshing…' });
    expect(subscriptionStatus(sub({ nextRefreshAt: minutesAgo(0), lastError: 'Unreachable' }), now).text).toBe('Refreshing…');
  });
});
