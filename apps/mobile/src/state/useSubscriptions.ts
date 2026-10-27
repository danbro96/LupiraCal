import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  createSubscription, deleteSubscription, getSubscribedEvent, listSubscriptions, refreshSubscription, updateSubscription,
} from '@lupira/cal-api/fetch/cal';
import type { CreateSubscriptionRequest, UpdateSubscriptionRequest } from '@lupira/cal-api/models';
import { isRefreshPending } from '@lupira/cal-domain/subscriptions';
import { subscribedOccurrence, type SubscribedOccurrence } from '../data/queries/subscriptions';
import { Aggregate } from '../domain/aggregates';
import { engine, readyDb } from '../sync/engine';

const PENDING_POLL_MS = 5_000;

const subscriptionsKey = (calendarId: string) => ['subscriptions', calendarId] as const;

/** A calendar's subscriptions, polled while a fetch is due; a feed synced since the last look pulls the mirror. */
export function useSubscriptions(calendarId: string) {
  const query = useQuery({
    ...onlineQuery(subscriptionsKey(calendarId), () => listSubscriptions(calendarId)),
    refetchInterval: (q) => ((q.state.data ?? []).some((s) => isRefreshPending(s, new Date())) ? PENDING_POLL_MS : false),
  });
  const synced = (query.data ?? []).map((s) => `${s.id}:${s.lastSyncedAt ?? ''}`).join('|');
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (!query.isSuccess) return;
    if (seen.current !== null && seen.current !== synced) engine.sync();
    seen.current = synced;
  }, [query.isSuccess, synced]);

  return query;
}

/** Online-only: the mirror gets the change on the pull each success starts. */
export function useSubscriptionMutations(calendarId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    engine.sync();
    return queryClient.invalidateQueries({ queryKey: subscriptionsKey(calendarId) });
  };
  return {
    create: useMutation({ mutationFn: (body: CreateSubscriptionRequest) => createSubscription(calendarId, body), onSuccess }),
    update: useMutation({
      mutationFn: ({ subscriptionId, body }: { subscriptionId: string; body: UpdateSubscriptionRequest }) =>
        updateSubscription(calendarId, subscriptionId, body),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (subscriptionId: string) => deleteSubscription(calendarId, subscriptionId), onSuccess }),
    refresh: useMutation({ mutationFn: (subscriptionId: string) => refreshSubscription(calendarId, subscriptionId), onSuccess }),
  };
}

export function useSubscribedOccurrence(eventId: string, startUtc: string) {
  return useQuery(mirrorQuery([Aggregate.subscribedEvent, eventId, startUtc], async () =>
    subscribedOccurrence(await readyDb(), eventId, startUtc)));
}

/** What the mirror leaves out: the description, recurrence and the subscription's name. */
export function useSubscribedEvent(occurrence: SubscribedOccurrence | null | undefined) {
  return useQuery({
    ...onlineQuery(['subscriptions', occurrence?.calendar_id, occurrence?.subscription_id, occurrence?.event_id], () =>
      getSubscribedEvent(occurrence!.calendar_id, occurrence!.subscription_id, occurrence!.event_id)),
    enabled: !!occurrence,
  });
}
