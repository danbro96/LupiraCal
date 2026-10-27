import { plural } from '@danbro96/lupira-domain-core/wording';

export type SubscriptionErrorName = 'Unreachable' | 'Rejected' | 'NotACalendar' | 'TooLarge' | 'Blocked';

/** What both clients need from a calendar subscription; structural so no wire type reaches this package. */
export type SubscriptionLike = {
  nextRefreshAt: string;
  lastSyncedAt?: string | null;
  lastError?: SubscriptionErrorName | null;
};

export type SubscriptionTone = 'ok' | 'pending' | 'error';

export const SUBSCRIPTION_ERROR_TEXT: Record<SubscriptionErrorName, string> = {
  Unreachable: "Address can't be reached",
  Rejected: 'Address refused access',
  NotACalendar: 'Not a calendar',
  TooLarge: 'Too large',
  Blocked: 'Address not allowed',
};

export function isSubscribedOrigin(origin: { kind: string } | null | undefined): boolean {
  return origin?.kind === 'Subscription';
}

/** Only owners may add, change or remove a calendar's subscriptions; every member sees them. */
export function canManageSubscriptions(calendar: { access?: string | null }): boolean {
  return calendar.access === 'Owner';
}

/** The server holds `nextRefreshAt` at or before now until the feed has been fetched. */
export function isRefreshPending(s: Pick<SubscriptionLike, 'nextRefreshAt'>, now: Date): boolean {
  return new Date(s.nextRefreshAt).getTime() <= now.getTime();
}

export function subscriptionStatus(s: SubscriptionLike, now: Date): { tone: SubscriptionTone; text: string } {
  if (isRefreshPending(s, now)) {
    return { tone: 'pending', text: s.lastSyncedAt || s.lastError ? 'Refreshing…' : 'Waiting for first sync' };
  }
  if (s.lastError) return { tone: 'error', text: SUBSCRIPTION_ERROR_TEXT[s.lastError] };
  if (s.lastSyncedAt) return { tone: 'ok', text: `Synced ${ago(new Date(s.lastSyncedAt), now)}` };
  return { tone: 'pending', text: 'Waiting for first sync' };
}

function ago(at: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${plural(Math.floor(hours / 24), 'day')} ago`;
}
