import type { FeatureCollection } from 'geojson';
import { useMemo } from 'react';
import type { LocationTripDto } from '@lupira/cal-api/models';
import { useMap } from './MapCanvas';
import { ACTIVITY_COLORS, activityColorExpression, MAP_COLORS, type MapTheme } from '@lupira/cal-tokens/map';
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

const CLUSTER_TEXT: LayerSpecSansSource['layout'] = {
  'text-field': ['get', 'point_count_abbreviated'],
  'text-font': ['Noto Sans Medium'],
  'text-size': 12,
};

/** Event pins colored by source calendar. */
export function EventsLayer({ theme, features }: { theme: MapTheme; features: FeatureCollection }) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const layers = useMemo<LayerSpecSansSource[]>(() => [
    {
      id: 'events-clusters', type: 'circle', filter: ['has', 'point_count'],
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 12, 10, 16, 50, 22],
        'circle-color': colors.eventFallback,
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
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
        'circle-radius': 7,
        'circle-color': ['coalesce', ['get', 'color'], colors.eventFallback],
        'circle-stroke-width': 2,
        'circle-stroke-color': colors.ring,
      },
    },
  ], [colors]);

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

  const layers = useMemo<LayerSpecSansSource[]>(() => [
    {
      id: 'contacts-clusters', type: 'circle', filter: ['has', 'point_count'],
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 11, 10, 15],
        'circle-color': colors.contact,
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
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
        'circle-radius': 6,
        'circle-color': colors.contact,
        'circle-stroke-width': 2,
        'circle-stroke-color': colors.ring,
      },
    },
    {
      id: 'contacts-labels', type: 'symbol', filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11.5,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-max-width': 14,
        'text-optional': true,
      },
      // Text wears ink, never the series color; the halo is the surface ring.
      paint: { 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': 1.2 },
    },
  ], [colors]);

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

  const layers = useMemo<LayerSpecSansSource[]>(() => [
    {
      id: 'contacts-former-pins', type: 'circle',
      paint: {
        'circle-radius': 6,
        'circle-opacity': 0,
        'circle-stroke-width': 2,
        'circle-stroke-color': colors.contact,
        'circle-stroke-opacity': 0.55,
      },
    },
    {
      id: 'contacts-former-labels', type: 'symbol',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-max-width': 14,
        'text-optional': true,
      },
      paint: { 'text-color': colors.ink, 'text-opacity': 0.6, 'text-halo-color': colors.ring, 'text-halo-width': 1.2 },
    },
  ], [colors]);

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

  const trackLayers = useMemo<LayerSpecSansSource[]>(() => [
    {
      id: 'track-casing', type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.ring, 'line-width': 6, 'line-opacity': 0.9 },
    },
    {
      id: 'track-line', type: 'line',
      filter: ['!=', ['get', 'activity'], 'Unknown'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': activityColorExpression(theme) as never, 'line-width': 3 },
    },
    {
      // Dashed, never a fifth hue — its own layer because line-dasharray takes no data expression.
      id: 'track-line-unknown', type: 'line',
      filter: ['==', ['get', 'activity'], 'Unknown'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ACTIVITY_COLORS[theme].Unknown, 'line-width': 3, 'line-dasharray': [2, 2] },
    },
  ], [theme, colors]);
  useGeoJsonLayer(map, 'track', track, trackLayers);

  const visitLayers = useMemo<LayerSpecSansSource[]>(() => [
    {
      id: 'visits-circles', type: 'circle',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'durationMin'], 5, 5, 480, 16],
        'circle-color': colors.visitFill,
        'circle-opacity': 0.35,
        'circle-stroke-width': 2,
        'circle-stroke-color': colors.visitFill,
      },
    },
  ], [colors]);
  useGeoJsonLayer(map, 'visits', visits, visitLayers, {
    interactive: INTERACTIVE.visits,
  });

  const currentLayers = useMemo<LayerSpecSansSource[]>(() => [
    {
      id: 'current-halo', type: 'circle',
      paint: { 'circle-radius': 14, 'circle-color': colors.currentFill, 'circle-opacity': 0.2 },
    },
    {
      id: 'current-dot', type: 'circle',
      paint: {
        'circle-radius': 6,
        'circle-color': colors.currentFill,
        'circle-stroke-width': 2.5,
        'circle-stroke-color': colors.ring,
      },
    },
  ], [colors]);
  useGeoJsonLayer(map, 'current', current, currentLayers, {
    interactive: INTERACTIVE.current,
  });
  return null;
}

/** Saved-place pins. */
export function SavedPlacesLayer({ theme, features }: CommonLayerProps & { features: FeatureCollection }) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const layers = useMemo<LayerSpecSansSource[]>(() => [
    {
      id: 'saved-pins', type: 'circle',
      paint: {
        'circle-radius': ['case', ['get', 'isFavorite'], 8, 6],
        'circle-color': colors.saved,
        'circle-stroke-width': 2,
        'circle-stroke-color': colors.ring,
      },
    },
  ], [colors]);

  useGeoJsonLayer(map, 'saved', features, layers, {
    interactive: INTERACTIVE.saved,
  });
  return null;
}

/** Hotspot halos sized by active days, drawn beneath the pins. */
export function HotspotsLayer({ theme, features }: CommonLayerProps & { features: FeatureCollection }) {
  const map = useMap();
  const colors = MAP_COLORS[theme];

  const layers = useMemo<LayerSpecSansSource[]>(() => [
    {
      id: 'hotspots-halo', type: 'circle',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'activeDays']], 1.7, 12, 10, 34],
        'circle-color': colors.hotspot,
        'circle-opacity': 0.22,
        'circle-stroke-width': 2,
        'circle-stroke-color': colors.hotspot,
      },
    },
    {
      id: 'hotspots-labels', type: 'symbol', minzoom: 12,
      layout: {
        'text-field': ['coalesce', ['get', 'label'], ''],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11.5,
        'text-max-width': 14,
        'text-optional': true,
      },
      paint: { 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': 1.2 },
    },
  ], [colors]);

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

  const layers = useMemo<LayerSpecSansSource[]>(() => [
    {
      id: 'photos-clusters', type: 'circle', filter: ['>', ['get', 'count'], 1],
      paint: {
        'circle-radius': ['step', ['get', 'count'], 12, 10, 16, 50, 22],
        'circle-color': colors.photo,
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
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
        'circle-radius': 6,
        'circle-color': colors.photo,
        'circle-stroke-width': 2,
        'circle-stroke-color': colors.ring,
      },
    },
  ], [colors]);

  useGeoJsonLayer(map, 'photos', features, layers, {
    interactive: INTERACTIVE.photos,
  });
  return null;
}

/** Trips exist in state (list + endpoint visit ids) but draw as the track itself in v1. */
export type { LocationTripDto };
