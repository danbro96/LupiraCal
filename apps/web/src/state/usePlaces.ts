import { useMutation } from '@tanstack/react-query';
import { createPlaceFromGeocode, createPlaceFromPin, useGetPlace } from '@lupira/cal-api/query/geo';
import type { GeocodeResultDto, ResolvePlaceResponse } from '@lupira/cal-api/models';
import { GEOCODER_UNAVAILABLE, placeRequestFromHit } from '@danbro96/lupira-domain-places/places';
import { selectPlace, type PlaceSelection, type PlaceSelectionVia } from '@lupira/cal-domain/placeSelection';

/** A single gazetteer place with its containment chain (outermost→innermost). */
export function useGeoPlace(placeId: string | undefined) {
  return useGetPlace(placeId ?? '', { query: { enabled: !!placeId } });
}

export type GeocodeHit = Pick<GeocodeResultDto, 'displayName' | 'latitude' | 'longitude'>
  & Partial<Pick<GeocodeResultDto, 'osmType' | 'osmId' | 'street' | 'houseNumber' | 'postcode' | 'locality' | 'countryCode'>>;

function selection(res: ResolvePlaceResponse, via: PlaceSelectionVia): PlaceSelection {
  if (!res.placeId) throw new Error(GEOCODER_UNAVAILABLE);
  return selectPlace(res.placeId, res.name, via);
}

/** A picked geocoder hit as a place: by OSM identity, with the hit's coordinates and address so the server can still
 *  create it when the lookup misses; a hit without identity is pinned where it lies. */
export function useResolveGeocodeHit() {
  return useMutation({
    mutationFn: async ({ hit, name }: { hit: GeocodeHit; name?: string | null }): Promise<PlaceSelection> => {
      const req = placeRequestFromHit(hit, name);
      if (req.kind === 'fromPin') {
        return selection(await createPlaceFromPin({ name: req.name ?? null, latitude: req.lat, longitude: req.lon }), 'geocode');
      }
      return selection(await createPlaceFromGeocode({
        osmType: req.osmType,
        osmId: req.osmId,
        name: req.name ?? null,
        latitude: hit.latitude,
        longitude: hit.longitude,
        street: hit.street ?? null,
        houseNumber: hit.houseNumber ?? null,
        postcode: hit.postcode ?? null,
        locality: hit.locality ?? null,
        countryCode: hit.countryCode ?? null,
      }), 'geocode');
    },
  });
}

/** A place at a dropped pin; the server reuses one within 25 m and names an unnamed pin from its address. */
export function usePinPlace() {
  return useMutation({
    mutationFn: async ({ lat, lon, name }: { lat: number; lon: number; name?: string | null }): Promise<PlaceSelection> =>
      selection(await createPlaceFromPin({ name: name?.trim() || null, latitude: lat, longitude: lon }), 'pin'),
  });
}
