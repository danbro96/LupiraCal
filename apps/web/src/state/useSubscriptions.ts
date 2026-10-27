import { useEffect, useRef } from 'react';
import {
  useCreateSubscription,
  useDeleteSubscription,
  useListSubscriptions,
  useRefreshSubscription,
  useUpdateSubscription,
} from '@lupira/cal-api/query/cal';
import { isRefreshPending } from '@lupira/cal-domain/subscriptions';
import { useInvalidateItems, useInvalidateSubscriptions } from './useInvalidate';

const PENDING_POLL_MS = 5_000;

/** A calendar's subscriptions, polled while a fetch is due; a newly synced feed refreshes the grids. */
export function useSubscriptions(calendarId: string) {
  const invalidateItems = useInvalidateItems();
  const query = useListSubscriptions(calendarId, {
    query: {
      refetchInterval: (q) => ((q.state.data ?? []).some((s) => isRefreshPending(s, new Date())) ? PENDING_POLL_MS : false),
    },
  });
  const subscriptions = query.data ?? [];
  const synced = subscriptions.map((s) => `${s.id}:${s.lastSyncedAt ?? ''}`).join('|');
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (!query.isSuccess) return;
    if (seen.current !== null && seen.current !== synced) invalidateItems().catch(reportError);
    seen.current = synced;
  }, [query.isSuccess, synced, invalidateItems]);

  return { ...query, subscriptions };
}

export function useSubscriptionMutations(onError: (e: unknown) => void) {
  const invalidate = useInvalidateSubscriptions();
  const opts = { mutation: { onSuccess: invalidate, onError } };
  return {
    create: useCreateSubscription(opts),
    update: useUpdateSubscription(opts),
    remove: useDeleteSubscription(opts),
    refresh: useRefreshSubscription(opts),
  };
}
