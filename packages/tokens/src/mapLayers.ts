import type { IconName } from './icons.ts';
import type { MapColorKey } from './map.ts';

/** The map's toggleable layers, one definition for both apps: order in the controls, label, the palette
 *  slot the toggle is tinted with, its icon concept, and whether it starts on. */
export type LayerKey = 'events' | 'photos' | 'movement' | 'hotspots' | 'contacts' | 'saved';

export interface LayerMeta {
  label: string;
  color: MapColorKey;
  icon: IconName;
  defaultOn: boolean;
}

export const LAYERS: Record<LayerKey, LayerMeta> = {
  events: { label: 'Events', color: 'eventFallback', icon: 'event', defaultOn: true },
  photos: { label: 'Photos', color: 'photo', icon: 'photo', defaultOn: true },
  movement: { label: 'Where I’ve been', color: 'visitFill', icon: 'timeline', defaultOn: true },
  hotspots: { label: 'Hotspots', color: 'hotspot', icon: 'target', defaultOn: false },
  contacts: { label: 'Contacts', color: 'contact', icon: 'group', defaultOn: false },
  saved: { label: 'Saved places', color: 'saved', icon: 'saved', defaultOn: true },
};

export const LAYER_KEYS = Object.keys(LAYERS) as LayerKey[];

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = Object.fromEntries(
  LAYER_KEYS.map((k) => [k, LAYERS[k].defaultOn]),
) as Record<LayerKey, boolean>;

export const isLayerKey = (v: string): v is LayerKey => v in LAYERS;
