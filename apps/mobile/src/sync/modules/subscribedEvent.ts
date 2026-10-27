import { getSyncSubscribedEvents } from '@lupira/cal-api/fetch/cal';
import type { SubscribedEventSyncDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { SUBSCRIBED_DDL, SUBSCRIBED_TABLES, writeSubscribedIndex } from '../../data/indexes/subscriptions';
import { Aggregate } from '../../domain/aggregates';

/** Read-only: subscribed feeds are managed online and never written from the device. */
export const subscribedEventModule: AggregateModule<SubscribedEventSyncDto, null, never, SubscribedEventSyncDto> = {
  aggregate: Aggregate.subscribedEvent,
  feed: {
    fetch: () => getSyncSubscribedEvents(),
    fromWire: (e) => ({ id: e.id, state: { doc: e, guards: null } }),
  },
  index: { version: 1, tables: SUBSCRIBED_TABLES, ddl: SUBSCRIBED_DDL, write: writeSubscribedIndex },
};
