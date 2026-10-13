import { lookupPlaces } from '@lupira/cal-api/fetch/geo';
import type { PlaceDto, PlaceLookupItemDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { Aggregate } from '../../domain/aggregates';

const LOOKUP_MAX = 200;

/** The places mirrored residencies point at, as a snapshot keyed by the id the residency stores (a merged place
 *  answers as its survivor) — so the contacts bridge publishes postal addresses without a connection. */
export function residencyPlaceModule(placeIds: () => Promise<string[]>): AggregateModule<PlaceDto, null, never, PlaceLookupItemDto> {
  return {
    aggregate: Aggregate.residencyPlace,
    feed: {
      fetch: async () => {
        const ids = await placeIds();
        const found: PlaceLookupItemDto[] = [];
        for (let i = 0; i < ids.length; i += LOOKUP_MAX) found.push(...await lookupPlaces({ ids: ids.slice(i, i + LOOKUP_MAX) }));
        return { cursor: '', hasMore: false, reset: true, changed: found.filter((f) => f.place), deleted: [] };
      },
      fromWire: (f) => ({ id: f.requestedId, state: { doc: f.place!, guards: null } }),
    },
  };
}
