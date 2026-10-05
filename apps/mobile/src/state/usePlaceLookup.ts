import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { useQuery } from '@tanstack/react-query';
import { lookupPlaces } from '@lupira/cal-api/fetch/geo';
import type { PlaceDto } from '@lupira/cal-api/models';
import { PLACE_LOOKUP_MAX, chunk, distinctPlaceIds, toLocatedPlaces } from '@danbro96/lupira-domain-places/places';

// Shared so the empty case keeps its identity — a fresh Map per render defeats callers' memoization.
const NO_PLACES = new Map<string, PlaceDto>();

/** Hydrate stored geo place ids into coordinates in one batched query. The id set is the key, not a
 *  URL path — lookup is a POST, which orval generates as a mutation. */
export function usePlaceCoords(placeIds: (string | null | undefined)[]): Map<string, PlaceDto> {
  const distinct = distinctPlaceIds(placeIds);
  const q = useQuery({
    ...onlineQuery(['map', 'places', distinct], async () =>
      toLocatedPlaces<PlaceDto>((await Promise.all(chunk(distinct, PLACE_LOOKUP_MAX).map((ids) => lookupPlaces({ ids })))).flat())),
    enabled: distinct.length > 0,
  });
  return q.data ?? NO_PLACES;
}
