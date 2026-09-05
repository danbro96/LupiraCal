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
