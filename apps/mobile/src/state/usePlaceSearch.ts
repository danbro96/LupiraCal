import { useQuery } from '@tanstack/react-query';
import { getHotspots } from '@lupira/cal-api/fetch/cal';
import { createPlace, createPlaceFromGeocode, forwardGeocode, suggestPlaces } from '@lupira/cal-api/fetch/geo';
import type { GeocodeResultDto } from '@lupira/cal-api/models';
import { hotspotStats } from '@lupira/cal-domain/mapFeatures';
import { useSyncStatus } from '../sync/syncStatus';

/** What the event editor stores: a geo place id plus the label written next to it. */
export type PlaceOption = { placeId: string; label: string; context?: string | null };

const FREQUENT_LIMIT = 8;

/** The caller's most-visited places. Same key and payload as the map's hotspot layer, so one fetch serves both. */
export function useFrequentPlaces(enabled: boolean) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['map', 'hotspots'],
    enabled: enabled && reachable,
    staleTime: 600_000,
    retry: 1,
    queryFn: async () => {
      const r = await getHotspots();
      if (r.status !== 200) throw new Error(`hotspots ${r.status}`);
      return r.data;
    },
    select: (hotspots): PlaceOption[] => hotspots
      .filter((h) => h.placeId && h.label)
      .slice(0, FREQUENT_LIMIT)
      .map((h) => ({ placeId: h.placeId!, label: h.label!, context: hotspotStats(h) })),
  });
}

/** Typeahead over places that already exist. */
export function useSuggestedPlaces(query: string) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const q = query.trim();
  return useQuery({
    queryKey: ['places', 'suggest', q],
    enabled: reachable && q.length >= 2,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<PlaceOption[]> => {
      const r = await suggestPlaces({ q, limit: 8 });
      if (r.status !== 200) throw new Error(`place suggest ${r.status}`);
      return r.data.map((s) => ({ placeId: s.id, label: s.name, context: s.context }));
    },
  });
}

/** Addresses the geocoder knows — none of them a place yet; picking one creates it. */
export function useGeocodeHits(query: string) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const q = query.trim();
  return useQuery({
    queryKey: ['places', 'geocode', q],
    enabled: reachable && q.length >= 2,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await forwardGeocode({ q, limit: 5 });
      if (r.status !== 200) throw new Error(`geocode ${r.status}`);
      return r.data;
    },
  });
}

/** A geocoder hit becomes a place: OSM-backed hits resolve server-side (deduped against existing places), the
 *  rest are created at their coordinates under the name that was typed. */
export async function createPlaceFromHit(hit: GeocodeResultDto, typedName: string): Promise<PlaceOption> {
  if (hit.osmType && hit.osmId != null) {
    const r = await createPlaceFromGeocode({ query: typedName, osmType: hit.osmType, osmId: hit.osmId });
    if (r.status !== 200 || !r.data.placeId) throw new Error('The geocoder is unavailable — no place was created.');
    return { placeId: r.data.placeId, label: r.data.name };
  }
  const r = await createPlace({
    name: typedName || hit.displayName,
    latitude: hit.latitude,
    longitude: hit.longitude,
    formattedAddress: hit.displayName,
    category: hit.category,
  });
  if (r.status !== 200) throw new Error(`create place ${r.status}`);
  return { placeId: r.data.id, label: r.data.name };
}
