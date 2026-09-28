import {
  GeoJSONSource,
  LayerAnnotation,
  Layer,
  type GeoJSONSourceRef,
  type PressEventWithFeatures,
  type SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native';
import type { FeatureCollection } from 'geojson';
import type { Ref } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import type { LivePosition } from '../../sync/livePosition';
import { ACTIVITY_COLORS, MAP_COLORS, activityColorExpression, type MapTheme } from '@lupira/cal-tokens/map';

/** One component per map layer, mirroring the web client's layers.tsx split. Each renders a source
 *  plus its paint layers and nothing else — the screen owns state, these own appearance. */

type PressHandler = (e: NativeSyntheticEvent<PressEventWithFeatures>) => void;

/** Explicit or MapLibre falls back to `Open Sans Regular,Arial Unicode MS Regular`, which geo-api's
 *  Noto glyph set 404s. Same stacks as the web layers.tsx. */
const CLUSTER_TEXT: SymbolLayerSpecification['layout'] = {
  'text-field': ['get', 'point_count_abbreviated'],
  'text-font': ['Noto Sans Medium'],
  'text-size': 12,
  'text-allow-overlap': true,
};

const CLUSTER_RADIUS = 48;
const CLUSTER_MAX_ZOOM = 14;

/** Cluster circle + count, shared by every clustered layer so the ramps stay identical. */
function ClusterLayers({ id, color, ring }: { id: string; color: string; ring: string }) {
  return (
    <>
      <Layer
        id={`${id}-clusters`}
        type="circle"
        filter={['has', 'point_count']}
        paint={{
          'circle-color': color,
          'circle-opacity': 0.85,
          'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
          'circle-stroke-color': ring,
          'circle-stroke-width': 2,
        }}
      />
      <Layer
        id={`${id}-cluster-counts`}
        type="symbol"
        filter={['has', 'point_count']}
        layout={CLUSTER_TEXT}
        paint={{ 'text-color': ring }}
      />
    </>
  );
}

export function EventsLayer({ theme, features, sourceRef, onPress }: {
  theme: MapTheme; features: FeatureCollection; sourceRef: Ref<GeoJSONSourceRef>; onPress: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <GeoJSONSource
      ref={sourceRef}
      id="events"
      data={features}
      cluster
      clusterRadius={CLUSTER_RADIUS}
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
      onPress={onPress}
    >
      <ClusterLayers id="event" color={colors.eventFallback} ring={colors.ring} />
      <Layer
        id="event-pins"
        type="circle"
        filter={['!', ['has', 'point_count']]}
        paint={{
          // Falls back when the source calendar has no colour of its own.
          'circle-color': ['coalesce', ['get', 'color'], colors.eventFallback],
          'circle-radius': 7,
          'circle-stroke-color': colors.ring,
          'circle-stroke-width': 2,
        }}
      />
    </GeoJSONSource>
  );
}

export function PhotosLayer({ theme, features, sourceRef, onPress }: {
  theme: MapTheme; features: FeatureCollection; sourceRef: Ref<GeoJSONSourceRef>; onPress: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <GeoJSONSource
      ref={sourceRef}
      id="photos"
      data={features}
      cluster
      clusterRadius={CLUSTER_RADIUS}
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
      onPress={onPress}
    >
      <ClusterLayers id="photo" color={colors.photo} ring={colors.ring} />
      <Layer
        id="photo-pins"
        type="circle"
        filter={['!', ['has', 'point_count']]}
        paint={{
          'circle-color': colors.photo,
          'circle-radius': 6,
          'circle-stroke-color': colors.ring,
          'circle-stroke-width': 2,
        }}
      />
    </GeoJSONSource>
  );
}

export function ContactsLayer({ theme, features, sourceRef, onPress }: {
  theme: MapTheme; features: FeatureCollection; sourceRef: Ref<GeoJSONSourceRef>; onPress: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <GeoJSONSource
      ref={sourceRef}
      id="contacts"
      data={features}
      cluster
      clusterRadius={CLUSTER_RADIUS}
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
      onPress={onPress}
    >
      <ClusterLayers id="contact" color={colors.contact} ring={colors.ring} />
      <Layer
        id="contact-pins"
        type="circle"
        filter={['!', ['has', 'point_count']]}
        paint={{
          'circle-color': colors.contact,
          'circle-radius': 6,
          'circle-stroke-color': colors.ring,
          'circle-stroke-width': 2,
        }}
      />
      <Layer
        id="contact-labels"
        type="symbol"
        filter={['!', ['has', 'point_count']]}
        layout={{
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
        }}
        paint={{ 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': 1 }}
      />
    </GeoJSONSource>
  );
}

export function SavedPlacesLayer({ theme, features }: { theme: MapTheme; features: FeatureCollection }) {
  const colors = MAP_COLORS[theme];
  return (
    <GeoJSONSource id="saved-places" data={features}>
      <Layer
        id="saved-circles"
        type="circle"
        paint={{
          'circle-color': colors.saved,
          'circle-radius': ['case', ['get', 'isFavorite'], 8, 6],
          'circle-stroke-color': colors.ring,
          'circle-stroke-width': 2,
        }}
      />
      <Layer
        id="saved-labels"
        type="symbol"
        layout={{
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
        }}
        paint={{ 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': 1 }}
      />
    </GeoJSONSource>
  );
}

export function HotspotsLayer({ theme, features, onPress }: {
  theme: MapTheme; features: FeatureCollection; onPress: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <GeoJSONSource id="hotspots" data={features} onPress={onPress}>
      <Layer
        id="hotspot-halos"
        type="circle"
        paint={{
          // sqrt so the halo's area, not its radius, tracks active days.
          'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'activeDays']], 1.7, 10, 10, 28],
          'circle-color': colors.hotspot,
          'circle-opacity': 0.22,
          'circle-stroke-color': colors.hotspot,
          'circle-stroke-width': 2,
        }}
      />
      <Layer
        id="hotspot-labels"
        type="symbol"
        minzoom={12}
        layout={{
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-optional': true,
        }}
        paint={{ 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': 1 }}
      />
    </GeoJSONSource>
  );
}

/** Where you've been: the track underneath, dwell circles on top, then each device's last known fix. */
export function MovementLayer({ theme, visits, track, current, onVisitPress }: {
  theme: MapTheme;
  visits: FeatureCollection;
  track: FeatureCollection;
  current: FeatureCollection;
  onVisitPress: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <>
      <GeoJSONSource id="track" data={track} lineMetrics>
        <Layer
          id="track-casing"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.ring, 'line-width': 6, 'line-opacity': 0.9 }}
        />
        <Layer
          id="track-line"
          type="line"
          filter={['!=', ['get', 'activity'], 'Unknown']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': activityColorExpression(theme) as never, 'line-width': 3 }}
        />
        {/* Dashed, never a fifth hue — its own layer because line-dasharray takes no data expression. */}
        <Layer
          id="track-line-unknown"
          type="line"
          filter={['==', ['get', 'activity'], 'Unknown']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': ACTIVITY_COLORS[theme].Unknown, 'line-width': 3, 'line-dasharray': [2, 2] }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="visits" data={visits} onPress={onVisitPress}>
        <Layer
          id="visit-circles"
          type="circle"
          paint={{
            // A five-minute stop reads small, an eight-hour stay reads large.
            'circle-radius': ['interpolate', ['linear'], ['get', 'durationMin'], 5, 5, 480, 16],
            'circle-color': colors.visitFill,
            'circle-opacity': 0.35,
            'circle-stroke-color': colors.visitFill,
            'circle-stroke-width': 2,
          }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="current-fixes" data={current}>
        <Layer
          id="current-halo"
          type="circle"
          paint={{ 'circle-radius': 14, 'circle-color': colors.currentFill, 'circle-opacity': 0.2 }}
        />
        <Layer
          id="current-dot"
          type="circle"
          paint={{
            'circle-radius': 6,
            'circle-color': colors.currentFill,
            'circle-stroke-color': colors.ring,
            'circle-stroke-width': 2.5,
          }}
        />
      </GeoJSONSource>
    </>
  );
}

/** The live puck. `LayerAnnotation` interpolates between fixes natively, so the dot glides instead of
 *  hopping — while still being driven by OUR position stream rather than a second GPS subscription of
 *  MapLibre's own. The dot you see is the fix we would record. */
export function LivePuck({ theme, position }: { theme: MapTheme; position: LivePosition }) {
  const colors = MAP_COLORS[theme];
  return (
    <LayerAnnotation id="live-position" animated lngLat={[position.lon, position.lat]}>
      <Layer
        id="live-accuracy"
        type="circle"
        paint={{ 'circle-radius': 18, 'circle-color': colors.eventFallback, 'circle-opacity': 0.15 }}
      />
      <Layer
        id="live-dot"
        type="circle"
        paint={{
          'circle-radius': 7,
          'circle-color': colors.eventFallback,
          'circle-stroke-color': colors.ring,
          'circle-stroke-width': 3,
        }}
      />
    </LayerAnnotation>
  );
}
