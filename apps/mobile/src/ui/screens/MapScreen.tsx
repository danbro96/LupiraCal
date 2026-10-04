import {
  Camera,
  Map as MapView,
  type CameraRef,
  type GeoJSONSourceRef,
  type MapRef,
  type PressEvent,
  type StyleSpecification,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useFocusEffect, useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Feature } from 'geojson';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { ActivityIndicator, Banner, useTheme } from 'react-native-paper';
import { mapViewport, type MapViewport } from '@lupira/cal-domain/geo';
import type { HitAction } from '@lupira/cal-domain/mapHitLabels';
import { hitsFromFeatures, type HitPoint, type MapHit } from '@lupira/cal-domain/mapHits';
import { photoCellBounds } from '@lupira/cal-domain/mapFeatures';
import { mapWindow, type MapSince } from '@lupira/cal-domain/mapWindow';
import { CELL_PADDING_PX, MAP_HOME, PIN_CLUSTERS, TARGET_ZOOM, zoomForSpan } from '@lupira/cal-domain/mapZoom';
import type { QuickPlace } from '@lupira/cal-domain/quickPlaces';
import { ymd } from '@lupira/cal-domain/time';
import type { MapTheme } from '@lupira/cal-tokens/map';
import { fallbackStyle } from '../../data/mapStyle';
import { toastError } from '../../feedback/toast';
import { useLocationTracking } from '../../state/location-tracking-store';
import { usePrefs } from '../../state/prefs-store';
import {
  useContactFeatures, useEventFeatures, useHotspotFeatures, useMovementFeatures, usePhotoFeatures, useSavedPlaceFeatures,
} from '../../state/useMapData';
import { useMapStyle } from '../../state/useMapStyle';
import { useQuickPlaces } from '../../state/useQuickPlaces';
import { useLivePosition } from '../../sync/livePosition';
import { DEFAULT_LAYERS, LAYER_KEYS, type LayerKey } from '@lupira/cal-tokens/mapLayers';
import { LayersFab, LayersSheet, LocateFab, type FollowMode } from '../map/MapChrome';
import { MapPreviewSheet } from '../map/MapPreviewSheet';
import { QuickPlacesStrip } from '../map/QuickPlacesStrip';
import {
  ContactsLayer, EventsLayer, HotspotsLayer, LivePuck, MovementLayer, PhotosLayer, SavedPlacesLayer, SelectionPin,
} from '../map/layers';
import { useMapAuthHeader } from '../map/useMapAuthHeader';
import type { MapTarget, RootStackParamList, TabParamList } from '../navigation/types';
import { ICONS } from '../icons';

/** Finger-sized: a tap this close to a pin counts as on it. */
const HIT_RADIUS = 14;
const CELL_PADDING = { top: CELL_PADDING_PX, right: CELL_PADDING_PX, bottom: CELL_PADDING_PX, left: CELL_PADDING_PX };

const LAYER_IDS: Record<LayerKey, string[]> = {
  events: ['event-pins', 'event-clusters'],
  contacts: ['contact-pins', 'contact-clusters'],
  photos: ['photo-pins', 'photo-clusters'],
  saved: ['saved-circles'],
  hotspots: ['hotspot-halos'],
  movement: ['visit-circles'],
};

/** Now, to the minute: stable enough to key queries on, recomputed each time the tab comes into view. */
const minuteNow = () => new Date(Math.floor(Date.now() / 60_000) * 60_000);

export function MapScreen() {
  const paper = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Map'>>();
  const scheme = useColorScheme();
  const theme: MapTheme = scheme === 'dark' ? 'dark' : 'light';

  useMapAuthHeader();

  const { style, degraded } = useMapStyle(theme);
  const layerPrefs = usePrefs((p) => p.mapLayers);
  const since = usePrefs((p) => p.mapSince);
  // A photo handed over from the gallery shows even if the layer is off — for this visit, not as a setting.
  const [photosForced, setPhotosForced] = useState(false);
  const enabled = { ...DEFAULT_LAYERS };
  for (const key of LAYER_KEYS) if (typeof layerPrefs[key] === 'boolean') enabled[key] = layerPrefs[key];
  if (photosForced) enabled.photos = true;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [follow, setFollow] = useState<FollowMode>('off');
  const [hits, setHits] = useState<MapHit[] | null>(null);
  const [selected, setSelected] = useState<HitPoint | null>(null);
  const [now, setNow] = useState(minuteNow);

  const span = mapWindow(since, now);
  const fromIso = span.from?.toISOString() ?? null;
  const events = useEventFeatures(span.eventsFromDay, span.eventsToDay, enabled.events);
  const saved = useSavedPlaceFeatures(enabled.saved);
  const photos = usePhotoFeatures(viewport, fromIso, enabled.photos);
  const contacts = useContactFeatures(enabled.contacts);
  const hotspots = useHotspotFeatures(fromIso, enabled.hotspots);
  const isFocused = useIsFocused();
  const movement = useMovementFeatures(span.movementFrom.toISOString(), span.to.toISOString(), enabled.movement, isFocused);
  const livePosition = useLivePosition((s) => s.position);
  const quickPlaces = useQuickPlaces(now.toISOString());
  const { width } = useWindowDimensions();

  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const eventSourceRef = useRef<GeoJSONSourceRef>(null);
  const contactSourceRef = useRef<GeoJSONSourceRef>(null);

  // The map mounts only once its style has loaded, so a target handed over on the first visit arrives before
  // there is a camera to move — it waits here until the map reports it's ready.
  const at = route.params?.at;
  const [initialView] = useState(() => (at
    ? { center: [at.lon, at.lat] as [number, number], zoom: TARGET_ZOOM }
    : { center: MAP_HOME.center, zoom: MAP_HOME.zoom }));
  const mapLoaded = useRef(false);
  const pendingTarget = useRef<MapTarget | null>(null);
  const flyTo = useCallback((t: MapTarget) => {
    cameraRef.current?.easeTo({ center: [t.lon, t.lat], zoom: TARGET_ZOOM, duration: 600 });
  }, []);
  const [appliedAt, setAppliedAt] = useState<typeof at>(undefined);
  if (at !== appliedAt) {
    setAppliedAt(at);
    if (at) {
      if (at.focus === 'photo') setPhotosForced(true);
      setFollow('off');
      setHits(null);
      setSelected({ lon: at.lon, lat: at.lat });
    }
  }
  useEffect(() => {
    if (!at) return;
    if (mapLoaded.current) flyTo(at);
    else pendingTarget.current = at;
  }, [at, flyTo]);
  const onMapLoaded = () => {
    mapLoaded.current = true;
    if (pendingTarget.current) flyTo(pendingTarget.current);
    pendingTarget.current = null;
  };

  // GPS stops when you leave the tab. Focus, not mount: a bottom tab stays mounted once visited.
  useFocusEffect(() => {
    setNow(minuteNow());
    void useLivePosition.getState().start();
    return () => useLivePosition.getState().stop();
  });

  // Camera.trackUserLocation would start MapLibre's own location engine — a second GPS subscription.
  useEffect(() => {
    if (follow === 'off' || !livePosition) return;
    cameraRef.current?.easeTo({
      center: [livePosition.lon, livePosition.lat],
      duration: 600,
      ...(follow === 'heading' && livePosition.headingDeg != null ? { bearing: livePosition.headingDeg } : {}),
    });
  }, [follow, livePosition]);

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    // MapLibre's bounds are already [west, south, east, north] — the order the API's bbox takes.
    setViewport(mapViewport(e.nativeEvent.bounds, e.nativeEvent.zoom));
    // A deliberate pan means the user took the wheel — drop follow-mode rather than fighting them.
    if (e.nativeEvent.userInteraction) setFollow('off');
  };

  const closePreview = () => {
    setHits(null);
    setSelected(null);
  };

  /** Everything under the finger, across layers: a cluster that can still split zooms in; one that can't
   *  (pins on one spot) lists its members; a lone photo cell zooms to its photos. Layers are queried one
   *  source at a time so each cluster is known to belong to the source that can expand it. */
  const onMapPress = async (e: NativeSyntheticEvent<PressEvent>) => {
    const [x, y] = e.nativeEvent.point;
    const box: [[number, number], [number, number]] = [[x - HIT_RADIUS, y - HIT_RADIUS], [x + HIT_RADIUS, y + HIT_RADIUS]];
    const found: Feature[] = [];
    let expand: { feature: Feature; zoom: number } | null = null;

    for (const key of LAYER_KEYS) {
      if (!enabled[key]) continue;
      const features = (await mapRef.current?.queryRenderedFeatures(box, { layers: LAYER_IDS[key] })) ?? [];
      const source = key === 'events' ? eventSourceRef : key === 'contacts' ? contactSourceRef : null;
      for (const f of features) {
        if (!source || !f.properties?.cluster) {
          found.push(f);
          continue;
        }
        const clusterId = f.properties.cluster_id as number;
        const zoom = await source.current?.getClusterExpansionZoom(clusterId);
        if (zoom != null && zoom <= PIN_CLUSTERS.maxZoom) expand = expand ?? { feature: f, zoom };
        else found.push(...((await source.current?.getClusterLeaves(clusterId, PIN_CLUSTERS.leaves, 0)) ?? []));
      }
    }

    const tapped = hitsFromFeatures(found);
    if (tapped.length === 0 && expand) {
      const [lng, lat] = (expand.feature.geometry as GeoJSON.Point).coordinates;
      cameraRef.current?.easeTo({ center: [lng, lat], zoom: expand.zoom + 0.5, duration: 400 });
      return;
    }
    if (tapped.length === 1 && tapped[0].kind === 'photoCell') {
      cameraRef.current?.fitBounds(photoCellBounds(tapped[0].bounds), { padding: CELL_PADDING, duration: 400 });
      return;
    }
    if (tapped.length === 0) {
      closePreview();
      return;
    }
    setSelected(tapped[0].point);
    setHits(tapped);
  };

  /** A jump frames the place by what it is, across the screen's width; an event also opens its card. */
  const onQuickPick = (p: QuickPlace) => {
    if (!p.point) return;
    setFollow('off');
    setSelected(p.point);
    cameraRef.current?.easeTo({
      center: [p.point.lon, p.point.lat], zoom: zoomForSpan(p.spanM, width, p.point.lat), duration: 600,
    });
    setHits(p.event ? [{ kind: 'event', key: p.key, point: p.point, ...p.event }] : null);
  };

  const onHitAction = (hit: MapHit, action: HitAction) => {
    if (action === 'zoom' && hit.kind === 'photoCell') {
      closePreview();
      cameraRef.current?.fitBounds(photoCellBounds(hit.bounds), { padding: CELL_PADDING, duration: 400 });
      return;
    }
    if (action === 'day' && (hit.kind === 'photo' || hit.kind === 'visit')) {
      const day = ymd(new Date(hit.kind === 'photo' ? hit.takenAt : hit.arriveTs));
      closePreview();
      navigation.navigate('Tabs', { screen: 'Photos', params: { from: day, to: day } });
      return;
    }
    if (action !== 'open') return;
    // The pin stays: coming back to the map, what you opened is still marked.
    setHits(null);
    if (hit.kind === 'event') navigation.navigate('ItemDetail', { itemId: hit.itemId });
    else if (hit.kind === 'contact') navigation.navigate('ContactDetail', { contactId: hit.contactId });
    else if (hit.kind === 'photo') navigation.navigate('PhotoViewer', { photoId: hit.photoId });
  };

  const onLocatePress = async () => {
    const started = await useLivePosition.getState().start();
    if (!started) {
      const granted = await useLocationTracking.getState().requestForeground();
      if (!granted) {
        toastError('Location permission is off — turn it on in Settings to see where you are.');
        return;
      }
      await useLivePosition.getState().start();
    }
    const position = useLivePosition.getState().position;
    if (position) {
      cameraRef.current?.easeTo({ center: [position.lon, position.lat], zoom: 15, duration: 500 });
    }
    setFollow((m) => (m === 'off' ? 'follow' : m === 'follow' ? 'heading' : 'off'));
  };

  const toggle = (key: LayerKey) => {
    if (key === 'photos') setPhotosForced(false);
    void usePrefs.getState().setMapLayers({ ...layerPrefs, [key]: !enabled[key] });
  };
  const setSince = (value: MapSince) => void usePrefs.getState().setMapSince(value);
  const mapStyle = style ?? (degraded ? fallbackStyle(theme) : undefined);

  return (
    <View style={[styles.root, { backgroundColor: paper.colors.background }]}>
      <QuickPlacesStrip places={quickPlaces} onPick={onQuickPick} />
      {degraded && (
        <Banner visible icon={ICONS.locationOff}>Basemap unavailable — showing pins on a plain background.</Banner>
      )}
      {mapStyle ? (
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            mapStyle={mapStyle as unknown as StyleSpecification}
            onRegionDidChange={onRegionDidChange}
            onDidFinishLoadingMap={onMapLoaded}
            onPress={(e) => void onMapPress(e)}
          >
            <Camera ref={cameraRef} initialViewState={initialView} />
            {/* Always mounted: a layer mounted later is appended above the pins and would cover them. */}
            <HotspotsLayer theme={theme} features={hotspots} />
            {enabled.movement && (
              <MovementLayer theme={theme} visits={movement.visits} track={movement.track} current={movement.current} />
            )}
            {enabled.saved && <SavedPlacesLayer theme={theme} features={saved} />}
            {enabled.contacts && <ContactsLayer theme={theme} features={contacts} sourceRef={contactSourceRef} />}
            {enabled.events && <EventsLayer theme={theme} features={events.features} sourceRef={eventSourceRef} />}
            {enabled.photos && <PhotosLayer theme={theme} features={photos} />}
            {livePosition && <LivePuck theme={theme} position={livePosition} />}
            {selected && <SelectionPin point={selected} />}
          </MapView>

          <LayersFab onPress={() => setSheetOpen(true)} style={styles.layersFab} />
          <LocateFab mode={follow} onPress={() => void onLocatePress()} style={styles.locateFab} />
        </View>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      )}

      {sheetOpen && (
        <LayersSheet
          theme={theme}
          enabled={enabled}
          since={since}
          unmappableCount={events.unmappableCount}
          onToggle={toggle}
          onSince={setSince}
          onDismiss={() => setSheetOpen(false)}
        />
      )}

      {hits && <MapPreviewSheet hits={hits} theme={theme} onAction={onHitAction} onDismiss={closePreview} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  layersFab: { position: 'absolute', right: 16, bottom: 88 },
  locateFab: { position: 'absolute', right: 16, bottom: 24 },
});
