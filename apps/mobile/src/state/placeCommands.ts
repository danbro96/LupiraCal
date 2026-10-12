import { createPlaceFromGeocode, createPlaceFromPin } from '@lupira/cal-api/fetch/geo';
import type { GeocodeResultDto } from '@lupira/cal-api/models';
import { GEOCODER_UNAVAILABLE, placeRequestFromHit, type PlaceRequest } from '@danbro96/lupira-domain-places/places';
import { selectPlace, type PlaceSelection } from '@lupira/cal-domain/placeSelection';

/** An OSM hit resolves server-side (deduped against existing places), carrying what was shown in case the lookup
 *  misses; a pin is created, or matched within 25 m. Online-only. */
export async function resolvePlaceRequest(request: PlaceRequest, hit?: Partial<GeocodeResultDto> | null): Promise<{ placeId: string; label: string }> {
  const resolved = request.kind === 'fromGeocode'
    ? await createPlaceFromGeocode({
      osmType: request.osmType,
      osmId: request.osmId,
      name: request.name ?? null,
      latitude: hit?.latitude ?? null,
      longitude: hit?.longitude ?? null,
      street: hit?.street ?? null,
      houseNumber: hit?.houseNumber ?? null,
      postcode: hit?.postcode ?? null,
      locality: hit?.locality ?? null,
      countryCode: hit?.countryCode ?? null,
    })
    : await createPlaceFromPin({ name: request.name ?? null, latitude: request.lat, longitude: request.lon, category: hit?.category ?? null });
  if (!resolved.placeId) throw new Error(GEOCODER_UNAVAILABLE);
  return { placeId: resolved.placeId, label: resolved.name };
}

export async function placeFromAddressHit(hit: GeocodeResultDto): Promise<PlaceSelection> {
  const { placeId, label } = await resolvePlaceRequest(placeRequestFromHit(hit), hit);
  return selectPlace(placeId, label, 'geocode');
}
