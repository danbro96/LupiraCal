import {
  GeoJSONSource,
  LayerAnnotation,
  Layer,
  Marker,
  type GeoJSONSourceRef,
  type PressEventWithFeatures,
  type SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native';
import type { FeatureCollection } from 'geojson';
import type { Ref } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import { Icon } from 'react-native-paper';
import type { LivePosition } from '../../sync/livePosition';
import { ACTIVITY_COLORS, MAP_COLORS, activityColorExpression, type MapTheme } from '@lupira/cal-tokens/map';
import {
  CLUSTER, CLUSTER_COUNT_LAYOUT, CURRENT_FIX, HOTSPOT, PIN, PIN_LABEL_HALO_WIDTH, PIN_LABEL_LAYOUT, TRACK, VISIT, clusterRadius,
  contactPinFill, contactPinStroke, hotspotRadius,
} from '@lupira/cal-tokens/mapPaint';
import { PIN_CLUSTERS } from '@lupira/cal-domain/mapZoom';
import { ICONS } from '../icons';
import { useColors } from '../theme';

/** One component per map layer, mirroring the web client's layers.tsx split. Each renders a source
 *  plus its paint layers and nothing else — the screen owns state, these own appearance. */

type PressHandler = (e: NativeSyntheticEvent<PressEventWithFeatures>) => void;

/** Explicit or MapLibre falls back to `Open Sans Regular,Arial Unicode MS Regular`, which geo-api's
 *  Noto glyph set 404s. Same stacks as the web layers.tsx. */
const CLUSTER_TEXT = { ...CLUSTER_COUNT_LAYOUT, 'text-field': ['get', 'point_count_abbreviated'] } as SymbolLayerSpecification['layout'];
const LABEL = { ...PIN_LABEL_LAYOUT, 'text-field': ['get', 'label'] } as SymbolLayerSpecification['layout'];


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
          'circle-opacity': CLUSTER.opacity,
          'circle-radius': clusterRadius('touch') as never,
          'circle-stroke-color': ring,
          'circle-stroke-width': PIN.strokeWidth,
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
  theme: MapTheme; features: FeatureCollection; sourceRef: Ref<GeoJSONSourceRef>; onPress?: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <GeoJSONSource
      ref={sourceRef}
      id="events"
      data={features}
      cluster
      clusterRadius={PIN_CLUSTERS.radius}
      clusterMaxZoom={PIN_CLUSTERS.maxZoom}
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
          'circle-radius': PIN.event,
          'circle-stroke-color': colors.ring,
          'circle-stroke-width': PIN.strokeWidth,
        }}
      />
    </GeoJSONSource>
  );
}

/** The server clusters photos, so a feature with a count above 1 is one of its grid cells, not a MapLibre cluster. */
export function PhotosLayer({ theme, features, onPress }: {
  theme: MapTheme; features: FeatureCollection; onPress?: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <GeoJSONSource id="photos" data={features} onPress={onPress}>
      <Layer
        id="photo-clusters"
        type="circle"
        filter={['>', ['get', 'count'], 1]}
        paint={{
          'circle-color': colors.photo,
          'circle-opacity': CLUSTER.opacity,
          'circle-radius': clusterRadius('touch', 'count') as never,
          'circle-stroke-color': colors.ring,
          'circle-stroke-width': PIN.strokeWidth,
        }}
      />
      <Layer
        id="photo-cluster-counts"
        type="symbol"
        filter={['>', ['get', 'count'], 1]}
        layout={{ ...CLUSTER_TEXT, 'text-field': ['get', 'countLabel'] }}
        paint={{ 'text-color': colors.ring }}
      />
      <Layer
        id="photo-pins"
        type="circle"
        filter={['==', ['get', 'count'], 1]}
        paint={{
          'circle-color': colors.photo,
          'circle-radius': PIN.photo,
          'circle-stroke-color': colors.ring,
          'circle-stroke-width': PIN.strokeWidth,
        }}
      />
    </GeoJSONSource>
  );
}

export function ContactsLayer({ theme, features, sourceRef, onPress }: {
  theme: MapTheme; features: FeatureCollection; sourceRef: Ref<GeoJSONSourceRef>; onPress?: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <GeoJSONSource
      ref={sourceRef}
      id="contacts"
      data={features}
      cluster
      clusterRadius={PIN_CLUSTERS.radius}
      clusterMaxZoom={PIN_CLUSTERS.maxZoom}
      onPress={onPress}
    >
      <ClusterLayers id="contact" color={colors.contact} ring={colors.ring} />
      <Layer
        id="contact-pins"
        type="circle"
        filter={['!', ['has', 'point_count']]}
        paint={{
          'circle-color': contactPinFill(colors.contact, colors.ring) as never,
          'circle-radius': PIN.contact,
          'circle-stroke-color': contactPinStroke(colors.contact, colors.ring) as never,
          'circle-stroke-width': PIN.strokeWidth,
        }}
      />
      <Layer
        id="contact-labels"
        type="symbol"
        filter={['!', ['has', 'point_count']]}
        layout={LABEL}
        paint={{ 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': PIN_LABEL_HALO_WIDTH }}
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
          'circle-radius': PIN.saved as never,
          'circle-stroke-color': colors.ring,
          'circle-stroke-width': PIN.strokeWidth,
        }}
      />
      <Layer
        id="saved-labels"
        type="symbol"
        layout={LABEL}
        paint={{ 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': PIN_LABEL_HALO_WIDTH }}
      />
    </GeoJSONSource>
  );
}

export function HotspotsLayer({ theme, features, onPress }: {
  theme: MapTheme; features: FeatureCollection; onPress?: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <GeoJSONSource id="hotspots" data={features} onPress={onPress}>
      <Layer
        id="hotspot-halos"
        type="circle"
        paint={{
          // sqrt so the halo's area, not its radius, tracks active days.
          'circle-radius': hotspotRadius('touch') as never,
          'circle-color': colors.hotspot,
          'circle-opacity': HOTSPOT.opacity,
          'circle-stroke-color': colors.hotspot,
          'circle-stroke-width': PIN.strokeWidth,
        }}
      />
      <Layer
        id="hotspot-labels"
        type="symbol"
        minzoom={HOTSPOT.labelMinZoom}
        layout={LABEL}
        paint={{ 'text-color': colors.ink, 'text-halo-color': colors.ring, 'text-halo-width': PIN_LABEL_HALO_WIDTH }}
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
  onVisitPress?: PressHandler;
}) {
  const colors = MAP_COLORS[theme];
  return (
    <>
      <GeoJSONSource id="track" data={track} lineMetrics>
        <Layer
          id="track-casing"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.ring, 'line-width': TRACK.casingWidth, 'line-opacity': TRACK.casingOpacity }}
        />
        <Layer
          id="track-line"
          type="line"
          filter={['!=', ['get', 'activity'], 'Unknown']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': activityColorExpression(theme) as never, 'line-width': TRACK.width }}
        />
        {/* Dashed, never a fifth hue — its own layer because line-dasharray takes no data expression. */}
        <Layer
          id="track-line-unknown"
          type="line"
          filter={['==', ['get', 'activity'], 'Unknown']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': ACTIVITY_COLORS[theme].Unknown, 'line-width': TRACK.width, 'line-dasharray': [...TRACK.unknownDash] }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="visits" data={visits} onPress={onVisitPress}>
        <Layer
          id="visit-circles"
          type="circle"
          paint={{
            // A five-minute stop reads small, an eight-hour stay reads large.
            'circle-radius': VISIT.radius as never,
            'circle-color': colors.visitFill,
            'circle-opacity': VISIT.opacity,
            'circle-stroke-color': colors.visitFill,
            'circle-stroke-width': PIN.strokeWidth,
          }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="current-fixes" data={current}>
        <Layer
          id="current-halo"
          type="circle"
          paint={{ 'circle-radius': CURRENT_FIX.haloRadius, 'circle-color': colors.currentFill, 'circle-opacity': CURRENT_FIX.haloOpacity }}
        />
        <Layer
          id="current-dot"
          type="circle"
          paint={{
            'circle-radius': CURRENT_FIX.dotRadius,
            'circle-color': colors.currentFill,
            'circle-stroke-color': colors.ring,
            'circle-stroke-width': CURRENT_FIX.dotStrokeWidth,
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

const SELECTION_PIN = 40;

/** A pin over whatever is selected — the dot you tapped, or the place another screen sent you to. A native
 *  view, not a style layer: the basemap sprite has no pin, and a view needs none. The ring glyph behind
 *  keeps the pin legible on any tile. */
export function SelectionPin({ point }: { point: { lon: number; lat: number } }) {
  const c = useColors();
  return (
    <Marker id="selection" lngLat={[point.lon, point.lat]} anchor="bottom">
      <View pointerEvents="none" style={styles.pin}>
        <View style={styles.pinRing}><Icon source={ICONS.place} size={SELECTION_PIN + 4} color={c.onPrimary} /></View>
        <Icon source={ICONS.place} size={SELECTION_PIN} color={c.primary} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pin: { width: SELECTION_PIN + 4, height: SELECTION_PIN + 4, alignItems: 'center', justifyContent: 'flex-end' },
  pinRing: { position: 'absolute', top: 0, left: 0 },
});
