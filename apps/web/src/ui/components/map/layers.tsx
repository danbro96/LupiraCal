import type { FeatureCollection } from 'geojson';
import type { LocationTripDto } from '@lupira/cal-api/models';
import { useMap } from './MapCanvas';
import { ACTIVITY_COLORS, activityColorExpression, MAP_COLORS, type MapTheme } from '@danbro96/lupira-tokens-map/map';
import {
  CLUSTER, CLUSTER_COUNT_LAYOUT, CURRENT_FIX, HOTSPOT, PIN, PIN_LABEL_HALO_WIDTH, PIN_LABEL_LAYOUT, TRACK, VISIT, clusterRadius,
  contactPinFill, contactPinStroke, hotspotRadius,
} from '@lupira/cal-tokens/mapPaint';
import { useGeoJsonLayer, type LayerSpecSansSource } from './useGeoJsonLayer';

/** The layers a click resolves against, by source (MapScreen queries them all at once). */
const INTERACTIVE = {
  events: ['events-pins', 'events-clusters'],
  contacts: ['contacts-pins', 'contacts-clusters'],
  'contacts-former': ['contacts-former-pins'],
  visits: ['visits-circles'],
  current: ['current-dot'],
  saved: ['saved-pins'],
  hotspots: ['hotspots-halo'],
  photos: ['photos-pins', 'photos-clusters'],
} as const;

export const INTERACTIVE_LAYER_IDS: readonly string[] = Object.values(INTERACTIVE).flat();

interface CommonLayerProps {
  theme: MapTheme;
}

const CLUSTER_TEXT = { ...CLUSTER_COUNT_LAYOUT, 'text-field': ['get', 'point_count_abbreviated'] } as LayerSpecSansSource['layout'];

/** Event pins colored by source calendar. */
export function EventsLayer({ theme, features }: { theme: MapTheme; features: FeatureCollection }) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const layers: LayerSpecSansSource[] = [
    {
      id: 'events-clusters', type: 'circle', filter: ['has', 'point_count'],
      paint: {
        'circle-radius': clusterRadius('pointer') as never,
        'circle-color': colors.eventFallback,
        'circle-opacity': CLUSTER.opacity,
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': colors.ring,
      },
    },
    {
      id: 'events-cluster-count', type: 'symbol', filter: ['has', 'point_count'],
      layout: CLUSTER_TEXT,
      paint: { 'text-color': colors.ring },
    },
    {
      id: 'events-pins', type: 'circle', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': PIN.event,
        'circle-color': ['coalesce', ['get', 'color'], colors.eventFallback],
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': colors.ring,
      },
    },
  ];

  useGeoJsonLayer(map, 'events', features, layers, {
    cluster: true,
    interactive: INTERACTIVE.events,
  });
  return null;
}

/** Contact pins, a household merged into one. */
export function ContactsLayer({ theme, features }: CommonLayerProps & { features: FeatureCollection }) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const layers: LayerSpecSansSource[] = [
    {
      id: 'contacts-clusters', type: 'circle', filter: ['has', 'point_count'],
      paint: {
        'circle-radius': clusterRadius('pointer') as never,
        'circle-color': colors.contact,
        'circle-opacity': CLUSTER.opacity,
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': colors.ring,
      },
    },
    {
      id: 'contacts-cluster-count', type: 'symbol', filter: ['has', 'point_count'],
      layout: CLUSTER_TEXT,
      paint: { 'text-color': colors.ring },
    },
    {
      id: 'contacts-pins', type: 'circle', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': PIN.contact,
        'circle-color': contactPinFill(colors.contact, colors.ring) as never,
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': contactPinStroke(colors.contact, colors.ring) as never,
      },
    },
    {
      id: 'contacts-labels', type: 'symbol', filter: ['!', ['has', 'point_count']],
      layout: { ...PIN_LABEL_LAYOUT, 'text-field': ['get', 'label'] } as LayerSpecSansSource['layout'],
      // Text wears ink, never the series color; the halo is the surface ring.
      paint: { 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': PIN_LABEL_HALO_WIDTH },
    },
  ];

  useGeoJsonLayer(map, 'contacts', features, layers, {
    cluster: true,
    interactive: INTERACTIVE.contacts,
  });
  return null;
}

/** Former residencies: hollow faded pins beneath the current contact pins; no clustering (few entries). */
export function FormerContactsLayer({ theme, features }: CommonLayerProps & { features: FeatureCollection }) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const layers: LayerSpecSansSource[] = [
    {
      id: 'contacts-former-pins', type: 'circle',
      paint: {
        'circle-radius': PIN.contact,
        'circle-opacity': 0,
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': colors.contact,
        'circle-stroke-opacity': 0.55,
      },
    },
    {
      id: 'contacts-former-labels', type: 'symbol',
      layout: { ...PIN_LABEL_LAYOUT, 'text-field': ['get', 'label'] } as LayerSpecSansSource['layout'],
      paint: { 'text-color': colors.ink, 'text-opacity': 0.6, 'text-halo-color': colors.ring, 'text-halo-width': PIN_LABEL_HALO_WIDTH },
    },
  ];

  useGeoJsonLayer(map, 'contacts-former', features, layers, {
    interactive: INTERACTIVE['contacts-former'],
  });
  return null;
}

/** Visits (dwell-sized circles), activity-colored track lines with a surface casing, live position. */
export function MovementLayer({ theme, visits, track, current }: CommonLayerProps & {
  visits: FeatureCollection;
  track: FeatureCollection;
  current: FeatureCollection;
}) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const trackLayers: LayerSpecSansSource[] = [
    {
      id: 'track-casing', type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.ring, 'line-width': TRACK.casingWidth, 'line-opacity': TRACK.casingOpacity },
    },
    {
      id: 'track-line', type: 'line',
      filter: ['!=', ['get', 'activity'], 'Unknown'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': activityColorExpression(theme) as never, 'line-width': TRACK.width },
    },
    {
      // Dashed, never a fifth hue — its own layer because line-dasharray takes no data expression.
      id: 'track-line-unknown', type: 'line',
      filter: ['==', ['get', 'activity'], 'Unknown'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ACTIVITY_COLORS[theme].Unknown, 'line-width': TRACK.width, 'line-dasharray': [...TRACK.unknownDash] },
    },
  ];
  useGeoJsonLayer(map, 'track', track, trackLayers);

  const visitLayers: LayerSpecSansSource[] = [
    {
      id: 'visits-circles', type: 'circle',
      paint: {
        'circle-radius': VISIT.radius as never,
        'circle-color': colors.visitFill,
        'circle-opacity': VISIT.opacity,
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': colors.visitFill,
      },
    },
  ];
  useGeoJsonLayer(map, 'visits', visits, visitLayers, {
    interactive: INTERACTIVE.visits,
  });

  const currentLayers: LayerSpecSansSource[] = [
    {
      id: 'current-halo', type: 'circle',
      paint: { 'circle-radius': CURRENT_FIX.haloRadius, 'circle-color': colors.currentFill, 'circle-opacity': CURRENT_FIX.haloOpacity },
    },
    {
      id: 'current-dot', type: 'circle',
      paint: {
        'circle-radius': CURRENT_FIX.dotRadius,
        'circle-color': colors.currentFill,
        'circle-stroke-width': CURRENT_FIX.dotStrokeWidth,
        'circle-stroke-color': colors.ring,
      },
    },
  ];
  useGeoJsonLayer(map, 'current', current, currentLayers, {
    interactive: INTERACTIVE.current,
  });
  return null;
}

/** Saved-place pins. */
export function SavedPlacesLayer({ theme, features }: CommonLayerProps & { features: FeatureCollection }) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const layers: LayerSpecSansSource[] = [
    {
      id: 'saved-pins', type: 'circle',
      paint: {
        'circle-radius': PIN.saved as never,
        'circle-color': colors.saved,
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': colors.ring,
      },
    },
  ];

  useGeoJsonLayer(map, 'saved', features, layers, {
    interactive: INTERACTIVE.saved,
  });
  return null;
}

/** Hotspot halos sized by active days, drawn beneath the pins. */
export function HotspotsLayer({ theme, features }: CommonLayerProps & { features: FeatureCollection }) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const layers: LayerSpecSansSource[] = [
    {
      id: 'hotspots-halo', type: 'circle',
      paint: {
        'circle-radius': hotspotRadius('pointer') as never,
        'circle-color': colors.hotspot,
        'circle-opacity': HOTSPOT.opacity,
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': colors.hotspot,
      },
    },
    {
      id: 'hotspots-labels', type: 'symbol', minzoom: HOTSPOT.labelMinZoom,
      layout: { ...PIN_LABEL_LAYOUT, 'text-field': ['coalesce', ['get', 'label'], ''] } as LayerSpecSansSource['layout'],
      paint: { 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': PIN_LABEL_HALO_WIDTH },
    },
  ];

  useGeoJsonLayer(map, 'hotspots', features, layers, {
    beneathData: true,
    interactive: INTERACTIVE.hotspots,
  });
  return null;
}

/** Photo pins and the server's cell bubbles (not client clusters). */
export function PhotosLayer({ theme, features }: CommonLayerProps & { features: FeatureCollection }) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const layers: LayerSpecSansSource[] = [
    {
      id: 'photos-clusters', type: 'circle', filter: ['>', ['get', 'count'], 1],
      paint: {
        'circle-radius': clusterRadius('pointer', 'count') as never,
        'circle-color': colors.photo,
        'circle-opacity': CLUSTER.opacity,
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': colors.ring,
      },
    },
    {
      id: 'photos-cluster-count', type: 'symbol', filter: ['>', ['get', 'count'], 1],
      layout: { ...CLUSTER_TEXT, 'text-field': ['get', 'countLabel'] },
      paint: { 'text-color': colors.ring },
    },
    {
      id: 'photos-pins', type: 'circle', filter: ['==', ['get', 'count'], 1],
      paint: {
        'circle-radius': PIN.photo,
        'circle-color': colors.photo,
        'circle-stroke-width': PIN.strokeWidth,
        'circle-stroke-color': colors.ring,
      },
    },
  ];

  useGeoJsonLayer(map, 'photos', features, layers, {
    interactive: INTERACTIVE.photos,
  });
  return null;
}

/** Trips exist in state (list + endpoint visit ids) but draw as the track itself in v1. */
export type { LocationTripDto };
