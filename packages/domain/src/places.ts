// Coordinate helpers (primitives only; domain stays independent of the generated API models). Place hierarchy
// (containment) now comes pre-resolved from LupiraGeoApi as an AdminArea chain — no client-side walk needed.

/** OpenStreetMap deep-link for a coordinate, or null when either component is missing. */
export function osmUrl(lat?: number | null, lon?: number | null): string | null {
  if (lat == null || lon == null) return null;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}

/** "59.32930, 18.06860" or null when either component is missing/unparseable. */
export function formatCoords(lat?: number | null, lon?: number | null): string | null {
  if (lat == null || lon == null) return null;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/** Server cap per POST /places/lookup call. */
export const PLACE_LOOKUP_MAX = 200;

/** Distinct, sorted, nulls dropped — a stable query key and a stable request body. */
export function distinctPlaceIds(ids: readonly (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))].sort();
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Located = { latitude?: number | null; longitude?: number | null };

/** Only located places, keyed by the id that was asked for — a merged id maps to its survivor under the
 *  requested id, and unknown or deleted ids are simply absent. */
export function toLocatedPlaces<P extends Located>(
  results: readonly { requestedId: string; place?: P | null }[],
): Map<string, P> {
  const map = new Map<string, P>();
  for (const { requestedId, place } of results) {
    if (place && place.latitude != null && place.longitude != null) map.set(requestedId, place);
  }
  return map;
}

export const GEOCODER_UNAVAILABLE = 'The geocoder is unavailable — no place was created.';

/** How a picked address-search hit becomes a place. An OSM-backed hit resolves server-side (deduped against
 *  existing places; `query` must be the exact search the hits came from); any other is created at its
 *  coordinates under the name that was typed. `categories` = the API's known place categories. */
export function placeRequestFromHit(
  hit: { displayName: string; latitude: number; longitude: number; category?: string | null; osmType?: string | null; osmId?: number | null },
  typedName: string,
  categories: readonly string[],
):
  | { kind: 'fromGeocode'; body: { query: string; osmType: string; osmId: number } }
  | { kind: 'create'; body: { name: string; latitude: number; longitude: number; formattedAddress: string; category?: string } } {
  if (hit.osmType && hit.osmId != null) return { kind: 'fromGeocode', body: { query: typedName, osmType: hit.osmType, osmId: hit.osmId } };
  return {
    kind: 'create',
    body: {
      name: typedName || hit.displayName,
      latitude: hit.latitude,
      longitude: hit.longitude,
      formattedAddress: hit.displayName,
      ...(hit.category && categories.includes(hit.category) ? { category: hit.category } : {}),
    },
  };
}

/** A place tile's heading: the caller's label, the place's own name, a placeholder while it loads. */
export function placeTitle(label: string | null | undefined, name: string | null | undefined, placeId: string | null | undefined): string {
  return label || name || (placeId ? '…' : 'No place linked');
}
