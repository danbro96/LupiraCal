import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import { useMemo } from 'react';
import type { LocationTripDto } from '@lupira/cal-api/models';
import { useMap } from './MapCanvas';
import type { Bbox } from '@lupira/cal-domain/geo';
import { photoCellBounds } from '@lupira/cal-domain/mapFeatures';
import { ACTIVITY_COLORS, activityColorExpression, MAP_COLORS, type MapTheme } from '@lupira/cal-tokens/map';
import { featureProp, useGeoJsonLayer, type LayerSpecSansSource } from './useGeoJsonLayer';

/** What a pin click surfaces — MapScreen renders the popover / navigates. */
export interface PinSelection {
  lngLat: [number, number];
  kind: 'contact' | 'contact-former' | 'visit' | 'saved' | 'current' | 'photo' | 'hotspot';
  props: Record<string, unknown>;
}

interface CommonLayerProps {
  theme: MapTheme;
  onSelect: (selection: PinSelection) => void;
}

const CLUSTER_TEXT: LayerSpecSansSource['layout'] = {
  'text-field': ['get', 'point_count_abbreviated'],
  'text-font': ['Noto Sans Medium'],
  'text-size': 12,
};

function expandCluster(map: ReturnType<typeof useMap>, sourceId: string) {
  return (feature: MapGeoJSONFeature) => {
    const clusterId = feature.properties?.cluster_id as number;
    const source = map.getSource(sourceId) as GeoJSONSource;
    void source.getClusterExpansionZoom(clusterId).then((zoom) => {
      const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates;
      map.easeTo({ center: [lon, lat], zoom });
    });
  };
}

/** Event pins colored by source calendar; click opens the shared ?item= drawer. */
export function EventsLayer({ theme, features, onOpenItem }: {
  theme: MapTheme;
  features: FeatureCollection;
  onOpenItem: (itemId: string) => void;
}) {
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
    onClick: useMemo(() => ({
      'events-pins': (f: MapGeoJSONFeature) => {
        const itemId = featureProp<string>(f, 'itemId');
        if (itemId) onOpenItem(itemId);
      },
      'events-clusters': expandCluster(map, 'events'),
    }), [map, onOpenItem]),
  });
  return null;
}

/** Contact pins (household-deduped); click → popover with per-contact links. */
export function ContactsLayer({ theme, features, onSelect }: CommonLayerProps & { features: FeatureCollection }) {
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
    onClick: useMemo(() => ({
      'contacts-pins': (f: MapGeoJSONFeature, e) => onSelect({
        lngLat: [e.lngLat.lng, e.lngLat.lat],
        kind: 'contact',
        props: {
          names: featureProp<string[]>(f, 'names') ?? [],
          contactIds: featureProp<string[]>(f, 'contactIds') ?? [],
          placeId: featureProp<string>(f, 'placeId'),
          placeName: featureProp<string>(f, 'placeName'),
        },
      }),
      'contacts-clusters': expandCluster(map, 'contacts'),
    }), [map, onSelect]),
  });
  return null;
}

/** Former residencies: hollow faded pins beneath the current contact pins; no clustering (few entries). */
export function FormerContactsLayer({ theme, features, onSelect }: CommonLayerProps & { features: FeatureCollection }) {
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
    onClick: useMemo(() => ({
      'contacts-former-pins': (f: MapGeoJSONFeature, e) => onSelect({
        lngLat: [e.lngLat.lng, e.lngLat.lat],
        kind: 'contact-former',
        props: {
          names: featureProp<string[]>(f, 'names') ?? [],
          contactIds: featureProp<string[]>(f, 'contactIds') ?? [],
          periods: featureProp<string[]>(f, 'periods') ?? [],
          placeId: featureProp<string>(f, 'placeId'),
          placeName: featureProp<string>(f, 'placeName'),
        },
      }),
    }), [onSelect]),
  });
  return null;
}

/** Visits (dwell-sized circles), activity-colored track lines with a surface casing, live position. */
export function MovementLayer({ theme, visits, track, current, onSelect }: CommonLayerProps & {
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
    onClick: useMemo(() => ({
      'visits-circles': (f: MapGeoJSONFeature, e) => onSelect({
        lngLat: [e.lngLat.lng, e.lngLat.lat],
        kind: 'visit',
        props: {
          placeLabel: featureProp<string>(f, 'placeLabel'),
          arriveTs: featureProp<string>(f, 'arriveTs'),
          departTs: featureProp<string>(f, 'departTs'),
          durationMin: featureProp<number>(f, 'durationMin'),
        },
      }),
    }), [onSelect]),
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
    onClick: useMemo(() => ({
      'current-dot': (f: MapGeoJSONFeature, e) => onSelect({
        lngLat: [e.lngLat.lng, e.lngLat.lat],
        kind: 'current',
        props: { ts: featureProp<string>(f, 'ts'), batteryPct: featureProp<number>(f, 'batteryPct') },
      }),
    }), [onSelect]),
  });
  return null;
}

/** Saved-place pins; a gazetteer-linked one opens the place panel, a raw pin gets a popover. */
export function SavedPlacesLayer({ theme, features, onSelect, onOpenPlace }: CommonLayerProps & {
  features: FeatureCollection;
  onOpenPlace: (placeId: string) => void;
}) {
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
    onClick: useMemo(() => ({
      'saved-pins': (f: MapGeoJSONFeature, e) => {
        const placeId = featureProp<string>(f, 'placeId');
        if (placeId) onOpenPlace(placeId);
        else onSelect({
          lngLat: [e.lngLat.lng, e.lngLat.lat],
          kind: 'saved',
          props: { label: featureProp<string>(f, 'label'), icon: featureProp<string>(f, 'icon') },
        });
      },
    }), [onSelect, onOpenPlace]),
  });
  return null;
}

/** Hotspot halos sized by active days, drawn beneath the pins; an anchored one opens the place panel. */
export function HotspotsLayer({ theme, features, onSelect, onOpenPlace }: CommonLayerProps & {
  features: FeatureCollection;
  onOpenPlace: (placeId: string) => void;
}) {
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
    onClick: useMemo(() => ({
      'hotspots-halo': (f: MapGeoJSONFeature, e) => {
        // Every layer under the pointer fires; a click on a pin inside the halo belongs to the pin.
        if (!map.queryRenderedFeatures(e.point)[0]?.layer.id.startsWith('hotspots-')) return;
        const placeId = featureProp<string>(f, 'placeId');
        if (placeId) onOpenPlace(placeId);
        else onSelect({
          lngLat: [e.lngLat.lng, e.lngLat.lat],
          kind: 'hotspot',
          props: {
            center: (f.geometry as GeoJSON.Point).coordinates,
            label: featureProp<string>(f, 'label'),
            activeDays: featureProp<number>(f, 'activeDays'),
            eventCount: featureProp<number>(f, 'eventCount'),
            photoCount: featureProp<number>(f, 'photoCount'),
            firstDay: featureProp<string>(f, 'firstDay'),
            lastDay: featureProp<string>(f, 'lastDay'),
          },
        });
      },
    }), [map, onSelect, onOpenPlace]),
  });
  return null;
}

/** Photo pins and the server's cell bubbles (not client clusters); a pin surfaces its thumbnail in the
 *  popover, a bubble zooms to its photos. */
export function PhotosLayer({ theme, features, onSelect }: CommonLayerProps & { features: FeatureCollection }) {
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
    onClick: useMemo(() => ({
      'photos-pins': (f: MapGeoJSONFeature, e) => onSelect({
        lngLat: [e.lngLat.lng, e.lngLat.lat],
        kind: 'photo',
        props: {
          photoId: featureProp<string>(f, 'photoId'),
          kind: featureProp<string>(f, 'kind'),
          takenAt: featureProp<string>(f, 'takenAt'),
          placeLabel: featureProp<string>(f, 'placeLabel'),
          thumbUrl: featureProp<string>(f, 'thumbUrl'),
        },
      }),
      'photos-clusters': (f: MapGeoJSONFeature) => {
        const bounds = featureProp<Bbox>(f, 'bounds');
        if (bounds) map.fitBounds(photoCellBounds(bounds), { padding: 48, duration: 400 });
      },
    }), [map, onSelect]),
  });
  return null;
}

/** Trips exist in state (list + endpoint visit ids) but draw as the track itself in v1. */
export type { LocationTripDto };
