// Zoom from how much ground a map should show. A fixed zoom frames a house and a park the same way; a
// thumbnail needs the place plus enough around it to recognise where it is, and how much that is depends on
// what kind of place it is.

// MapLibre renders 512-px tiles: at zoom 0 the equator's 40,075 km spans 512 logical pixels.
const METERS_PER_PX_Z0 = 40_075_016.686 / 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 19;

/** The zoom at which `sizePx` logical pixels cover `spanM` metres at latitude `lat`. */
export function zoomForSpan(spanM: number, sizePx: number, lat: number): number {
  const z = Math.log2((METERS_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180) * sizePx) / spanM);
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

const ADDRESS_SPAN_M = 400;

/** Ground to show around a place, by its category, else its kind. Categories and kinds are geo-api's
 *  `PlaceCategory` / `PlaceKind` names, taken as strings so this stays free of the generated models. */
const SPAN_BY_CATEGORY: Record<string, number> = {
  Home: ADDRESS_SPAN_M,
  Office: ADDRESS_SPAN_M,
  Restaurant: 250,
  Cafe: 250,
  Bar: 250,
  Store: 250,
  Grocery: 250,
  Pharmacy: 250,
  Clinic: 250,
  Gym: 250,
  BusStop: 250,
  Hotel: 250,
  Worship: 250,
  Government: 250,
  School: 800,
  University: 800,
  Hospital: 800,
  Station: 800,
  Park: 800,
  Landmark: 800,
  Airport: 3000,
};

const SPAN_BY_KIND: Record<string, number> = {
  Address: ADDRESS_SPAN_M,
  Poi: 250,
  Area: 3000,
};

export function placeSpanM(place: { kind?: string | null; category?: string | null } | null | undefined): number {
  return SPAN_BY_CATEGORY[place?.category ?? ''] ?? SPAN_BY_KIND[place?.kind ?? ''] ?? ADDRESS_SPAN_M;
}

/** Where a map opens before any data arrives: the Nordics, the basemap extract's home. */
export const MAP_HOME = { center: [18.07, 59.33] as [number, number], zoom: 9 };

/** Street level: the block a point is on, not the city it's in. */
export const TARGET_ZOOM = 16;

/** Client-side clustering of event and contact pins. Past `maxZoom` nothing clusters, so a cluster that would
 *  still expand beyond it is pins sharing one spot — which a tap lists (up to `leaves`) instead of zooming. */
export const PIN_CLUSTERS = { radius: 48, maxZoom: 14, leaves: 50 } as const;

/** Inset when fitting the camera to a photo cell's bounds. */
export const CELL_PADDING_PX = 48;
