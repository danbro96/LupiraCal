import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lookupPlaces } from '@lupira/cal-api/fetch/geo';
import type { PlaceDto } from '@lupira/cal-api/models';
import { PLACE_LOOKUP_MAX, chunk, distinctPlaceIds, toLocatedPlaces } from '@lupira/cal-domain/places';
import { useSyncStatus } from '../sync/syncStatus';

// Shared so the empty case keeps its identity — a fresh Map per render defeats callers' useMemo.
const NO_PLACES = new Map<string, PlaceDto>();

/** Hydrate stored geo place ids into coordinates in one batched query. The id set is the key, not a
 *  URL path — lookup is a POST, which orval generates as a mutation. */
export function usePlaceCoords(placeIds: (string | null | undefined)[]): Map<string, PlaceDto> {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const distinct = useMemo(() => distinctPlaceIds(placeIds), [placeIds]);
  const q = useQuery({
    queryKey: ['map', 'places', distinct],
    enabled: reachable && distinct.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const results = await Promise.all(chunk(distinct, PLACE_LOOKUP_MAX).map((ids) => lookupPlaces({ ids })));
      // The fetch client returns a status union; narrowing per response keeps `data` typed as the list.
      return toLocatedPlaces<PlaceDto>(results.flatMap((r) => {
        if (r.status !== 200) throw new Error(`places lookup ${r.status}`);
        return r.data;
      }));
    },
  });
  return q.data ?? NO_PLACES;
}
