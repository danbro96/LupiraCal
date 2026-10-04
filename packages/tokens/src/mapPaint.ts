/**
 * Map mark sizes and label typography, shared by the web (maplibre-gl) and mobile (MapLibre Native) layers.
 * Colours come from `@danbro96/lupira-tokens-map/map`; the layer components stay per app. Where a size differs, it differs by input:
 * a finger needs bigger cluster targets, and a phone screen smaller hotspot halos.
 */

export type MapSurface = 'pointer' | 'touch';

/** Cluster bubble radius by member count (a MapLibre `step` over `countProp`). */
export function clusterRadius(surface: MapSurface, countProp = 'point_count'): unknown[] {
  const [small, medium, large] = surface === 'touch' ? [14, 18, 24] : [12, 16, 22];
  return ['step', ['get', countProp], small, 10, medium, 50, large];
}

/** Hotspot halo radius: sqrt so the halo's area, not its radius, tracks active days. */
export function hotspotRadius(surface: MapSurface): unknown[] {
  const [min, max] = surface === 'touch' ? [10, 28] : [12, 34];
  return ['interpolate', ['linear'], ['sqrt', ['get', 'activeDays']], 1.7, min, 10, max];
}

export const CLUSTER = { opacity: 0.85, strokeWidth: 2 } as const;

/** The count inside a cluster bubble; always drawn, even where bubbles overlap. */
export const CLUSTER_COUNT_LAYOUT: { 'text-font': string[]; 'text-size': number; 'text-allow-overlap': boolean } = {
  'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-allow-overlap': true,
};

export const PIN = {
  strokeWidth: 2,
  event: 7,
  contact: 6,
  photo: 6,
  /** A favourite saved place reads larger. */
  saved: ['case', ['get', 'isFavorite'], 8, 6] as unknown[],
} as const;

/** A contact pin is a dot in the contact colour; one where everyone is on holiday (`vacation`) is a ring instead. */
export function contactPinFill(contact: string, ring: string): unknown[] {
  return ['case', ['==', ['get', 'vacation'], true], ring, contact];
}

export function contactPinStroke(contact: string, ring: string): unknown[] {
  return ['case', ['==', ['get', 'vacation'], true], contact, ring];
}

/** A pin's name under it: ink on a ring-coloured halo, never the series colour. Dropped where it would collide. */
export const PIN_LABEL_LAYOUT: {
  'text-font': string[]; 'text-size': number; 'text-anchor': 'top'; 'text-offset': [number, number];
  'text-max-width': number; 'text-optional': boolean;
} = {
  'text-font': ['Noto Sans Regular'],
  'text-size': 11.5,
  'text-anchor': 'top',
  'text-offset': [0, 1],
  'text-max-width': 14,
  'text-optional': true,
};
export const PIN_LABEL_HALO_WIDTH = 1.2;

export const TRACK = { casingWidth: 6, casingOpacity: 0.9, width: 3, unknownDash: [2, 2] } as const;

/** A five-minute stop reads small, an eight-hour stay reads large. */
export const VISIT = {
  radius: ['interpolate', ['linear'], ['get', 'durationMin'], 5, 5, 480, 16] as unknown[],
  opacity: 0.35,
  strokeWidth: 2,
} as const;

export const CURRENT_FIX = { haloRadius: 14, haloOpacity: 0.2, dotRadius: 6, dotStrokeWidth: 2.5 } as const;

export const HOTSPOT = { opacity: 0.22, strokeWidth: 2, labelMinZoom: 12 } as const;
