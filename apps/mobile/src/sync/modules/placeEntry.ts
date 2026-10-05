import { getPlaceEntryChanges } from '@lupira/cal-api/fetch/contact';
import type { PlaceEntryDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { Aggregate } from '../../domain/aggregates';

/** Keyed by place: one entry per place, read by place id. */
export const placeEntryModule: AggregateModule<PlaceEntryDto, null, never, PlaceEntryDto> = {
  aggregate: Aggregate.placeEntry,
  feed: {
    fetch: (since) => getPlaceEntryChanges(since ? { since } : undefined),
    fromWire: (e) => ({ id: e.placeId, state: { doc: e, guards: null } }),
  },
};
