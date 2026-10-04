import { useQuery } from '@tanstack/react-query';
import { lookupPlaces } from '@lupira/cal-api/query/geo';
import type { PlaceDto } from '@lupira/cal-api/models';
import { PLACE_LOOKUP_MAX, chunk, distinctPlaceIds, toLocatedPlaces } from '@lupira/cal-domain/places';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hydrate stored geo place ids (cal items, contact addresses) into coordinates in one batched query.
 * Hand-rolled with a prefixed key: the id set is the key, not a URL path. Not seeded into useGeoPlace's
 * per-id cache — lookup omits containment, the detail pane needs it.
 */
export function usePlaceCoords(ids: readonly (string | null | undefined)[]): {
  places: Map<string, PlaceDto>;
  isLoading: boolean;
} {
  const distinct = distinctPlaceIds(ids);
  const { data, isLoading } = useQuery({
    queryKey: ['/geo-api/places/lookup', distinct],
    queryFn: async ({ signal }) =>
      (await Promise.all(chunk(distinct, PLACE_LOOKUP_MAX).map((ids) => lookupPlaces({ ids }, { signal })))).flat(),
    enabled: distinct.length > 0,
    staleTime: DAY_MS,
  });
  const places = toLocatedPlaces(data ?? []);
  return { places, isLoading: distinct.length > 0 && isLoading };
}
