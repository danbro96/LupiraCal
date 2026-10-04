import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetItemsByPlace } from '@lupira/cal-api/query/cal';
import {
  createPlace,
  createPlaceFromGeocode,
  getGetPlaceQueryKey,
  getPlace,
  useGetPlace,
  useSearchPlaces as useSearchGeoPlaces,
} from '@lupira/cal-api/query/geo';
import { PlaceCategory, type PlaceDto, type SearchPlacesParams } from '@lupira/cal-api/models';
import { GEOCODER_UNAVAILABLE, placeRequestFromHit } from '@lupira/cal-domain/places';

/** Browse/search the LupiraGeoApi gazetteer (text `q`, category, spatial `near`/`bbox`). */
export function useSearchPlaces(params: SearchPlacesParams) {
  return useSearchGeoPlaces(params);
}

/** A single gazetteer place with its containment chain (outermost→innermost). */
export function useGeoPlace(placeId: string | undefined) {
  return useGetPlace(placeId ?? '', { query: { enabled: !!placeId } });
}

/** Calendar items anchored to a geo place (its location, or a travel endpoint). */
export function usePlaceItems(placeId: string | undefined) {
  return useGetItemsByPlace(placeId ?? '', { query: { enabled: !!placeId } });
}

/** Structural mirror of a forward-geocode hit's create-relevant fields (the picker machine's
 *  PickerHit passes through unchanged; state can't import ui types). */
export type GeocodeHit = {
  displayName: string;
  latitude: number;
  longitude: number;
  category?: string | null;
  osmType?: string | null;
  osmId?: number | null;
};


function seedGetPlace(queryClient: ReturnType<typeof useQueryClient>, place: PlaceDto) {
  queryClient.setQueryData(getGetPlaceQueryKey(place.id), place);
}

/** Create/dedupe a place from a picked geocode hit. `typedName` must be the exact query the hits
 *  came from — from-geocode validates the hit against that query's frozen geocode cache. Hits
 *  without OSM identity fall back to a plain create with the hit's coordinates. */
export function useCreatePlaceFromHit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ hit, typedName }: { hit: GeocodeHit; typedName: string }): Promise<PlaceDto> => {
      const req = placeRequestFromHit(hit, typedName, Object.values(PlaceCategory));
      if (req.kind === 'fromGeocode') {
        const res = await createPlaceFromGeocode(req.body);
        if (!res.placeId) throw new Error(GEOCODER_UNAVAILABLE);
        // from-geocode returns a thin resolution; fetch the full DTO once to seed the cache.
        return getPlace(res.placeId);
      }
      return createPlace({ ...req.body, category: req.body.category as PlaceCategory | undefined });
    },
    onSuccess: (place) => seedGetPlace(queryClient, place),
  });
}

/** Create a place at manually pinned coordinates. */
export function useCreatePlaceAtPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, lat, lon }: { name: string; lat: number; lon: number }) =>
      createPlace({ name, latitude: lat, longitude: lon }),
    onSuccess: (place) => seedGetPlace(queryClient, place),
  });
}
