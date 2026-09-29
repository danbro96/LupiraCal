import {
  Camera,
  Map as MapView,
  TransformRequestManager,
  type CameraRef,
  type GeoJSONSourceRef,
  type PressEventWithFeatures,
  type StyleSpecification,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useFocusEffect, useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Banner, Portal, Text, useTheme } from 'react-native-paper';
import { mapViewport, type Bbox, type MapViewport } from '@lupira/cal-domain/geo';
import { hotspotStats, photoCellBounds } from '@lupira/cal-domain/mapFeatures';
import { fmtDate, parseYmd } from '@lupira/cal-domain/time';
import type { MapTheme } from '@lupira/cal-tokens/map';
import { fallbackStyle } from '../../data/mapStyle';
import { toastError } from '../../feedback/toast';
import { useAuth } from '../../state/auth-store';
import { useLocationTracking } from '../../state/location-tracking-store';
import {
  useContactFeatures, useEventFeatures, useHotspotFeatures, useMovementFeatures, usePhotoFeatures, useSavedPlaceFeatures,
} from '../../state/useMapData';
import { useMapStyle } from '../../state/useMapStyle';
import { useLivePosition } from '../../sync/livePosition';
import {
  DEFAULT_LAYERS, LayersFab, LayersSheet, LocateFab, type FollowMode, type LayerKey,
} from '../map/MapChrome';
import {
  ContactsLayer, EventsLayer, HotspotsLayer, LivePuck, MovementLayer, PhotosLayer, SavedPlacesLayer,
} from '../map/layers';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { ICONS } from '../icons';
import { Button } from '../components/Button';

// Matches the web MapScreen default (Nordics, the basemap extract's home).
const DEFAULT_CENTER: [number, number] = [18.07, 59.33];
const DEFAULT_ZOOM = 9;
const PAST_DAYS = 90;
const FUTURE_DAYS = 180;
/** Movement is the only layer scoped to a short window — a 90-day track would be unreadable. */
const MOVEMENT_DAYS = 7;

const AUTH_HEADER_ID = 'lupira-auth';
const CELL_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The native map fetches style assets (tiles/glyphs/sprite) itself, outside the mutator — the bearer
 *  rides a TransformRequestManager header scoped to the BFF origin. Scoping matters: presigned or
 *  third-party URLs must never receive an Authorization header. Re-adding the same id updates in place,
 *  which is what makes token rotation safe mid-session. */
function useMapAuthHeader() {
  const token = useAuth((s) => s.token);
  const apiUrl = useAuth((s) => s.apiUrl);
  useEffect(() => {
    if (!token) {
      TransformRequestManager.removeHeader(AUTH_HEADER_ID);
      return;
    }
    TransformRequestManager.addHeader({
      id: AUTH_HEADER_ID,
      name: 'Authorization',
      value: `Bearer ${token}`,
      match: `^${escapeRegex(apiUrl.replace(/\/$/, ''))}/`,
    });
  }, [token, apiUrl]);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type PhotoPin = { id: string; takenAt: string; placeLabel: string | null; thumbUrl: string | null };
type VisitPin = { placeLabel: string | null; arriveTs: string; departTs: string; durationMin: number };
type HotspotPin = {
  label: string | null; activeDays: number; eventCount: number; photoCount: number; firstDay: string; lastDay: string;
};

export function MapScreen() {
  const paper = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Map'>>();
  const scheme = useColorScheme();
  const theme: MapTheme = scheme === 'dark' ? 'dark' : 'light';

  useMapAuthHeader();

  const { style, degraded } = useMapStyle(theme);
  const [enabled, setEnabled] = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [follow, setFollow] = useState<FollowMode>('off');
  const [openPhoto, setOpenPhoto] = useState<PhotoPin | null>(null);
  const [openVisit, setOpenVisit] = useState<VisitPin | null>(null);
  const [openHotspot, setOpenHotspot] = useState<HotspotPin | null>(null);

  const { fromDay, toDay, movementFrom, movementTo } = useMemo(() => {
    const now = Date.now();
    return {
      fromDay: dayKey(new Date(now - PAST_DAYS * 86_400_000)),
      toDay: dayKey(new Date(now + FUTURE_DAYS * 86_400_000)),
      movementFrom: new Date(now - MOVEMENT_DAYS * 86_400_000).toISOString(),
      movementTo: new Date(now).toISOString(),
    };
  }, []);

  const events = useEventFeatures(fromDay, toDay, enabled.events);
  const saved = useSavedPlaceFeatures(enabled.saved);
  const photos = usePhotoFeatures(viewport, enabled.photos);
  const contacts = useContactFeatures(enabled.contacts);
  const hotspots = useHotspotFeatures(enabled.hotspots);
  const isFocused = useIsFocused();
  const movement = useMovementFeatures(movementFrom, movementTo, enabled.movement, isFocused);
  const livePosition = useLivePosition((s) => s.position);

  const cameraRef = useRef<CameraRef>(null);
  const eventSourceRef = useRef<GeoJSONSourceRef>(null);
  const contactSourceRef = useRef<GeoJSONSourceRef>(null);

  // Handed a photo's coordinates by the gallery: fly there and turn the layer on so it is visible.
  const at = route.params?.at;
  useEffect(() => {
    if (!at) return;
    setEnabled((prev) => ({ ...prev, photos: true }));
    setFollow('off');
    cameraRef.current?.easeTo({ center: [at.lon, at.lat], zoom: 15, duration: 600 });
  }, [at]);

  // GPS stops when you leave the tab. Focus, not mount: a bottom tab stays mounted once visited.
  useFocusEffect(useCallback(() => {
    void useLivePosition.getState().start();
    return () => useLivePosition.getState().stop();
  }, []));

  // Camera.trackUserLocation would start MapLibre's own location engine — a second GPS subscription.
  useEffect(() => {
    if (follow === 'off' || !livePosition) return;
    cameraRef.current?.easeTo({
      center: [livePosition.lon, livePosition.lat],
      duration: 600,
      ...(follow === 'heading' && livePosition.headingDeg != null ? { bearing: livePosition.headingDeg } : {}),
    });
  }, [follow, livePosition]);

  const onRegionDidChange = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    // MapLibre's bounds are already [west, south, east, north] — the order the API's bbox takes.
    setViewport(mapViewport(e.nativeEvent.bounds, e.nativeEvent.zoom));
    // A deliberate pan means the user took the wheel — drop follow-mode rather than fighting them.
    if (e.nativeEvent.userInteraction) setFollow('off');
  }, []);

  const expandCluster = useCallback(async (
    sourceRef: React.RefObject<GeoJSONSourceRef | null>,
    feature: GeoJSON.Feature,
  ) => {
    const clusterId = feature.properties?.cluster_id as number;
    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    const zoom = await sourceRef.current?.getClusterExpansionZoom(clusterId);
    if (zoom != null) cameraRef.current?.easeTo({ center: [lng, lat], zoom: zoom + 0.5, duration: 400 });
  }, []);

  const onEventPress = async (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const feature = e.nativeEvent.features[0];
    if (!feature) return;
    if (feature.properties?.cluster) return expandCluster(eventSourceRef, feature);
    const itemId = feature.properties?.itemId;
    if (typeof itemId === 'string') navigation.navigate('ItemDetail', { itemId });
  };

  const onPhotoPress = async (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const feature = e.nativeEvent.features[0];
    if (!feature) return;
    const props = feature.properties ?? {};
    if (Number(props.count) > 1) {
      // MapLibre stringifies nested properties, so the bounds may come back as JSON.
      const raw = props.bounds;
      const bounds = typeof raw === 'string' ? (JSON.parse(raw) as Bbox) : (raw as Bbox | null);
      if (bounds) cameraRef.current?.fitBounds(photoCellBounds(bounds), { padding: CELL_PADDING, duration: 400 });
      return;
    }
    setOpenPhoto({
      id: String(props.photoId),
      takenAt: String(props.takenAt),
      placeLabel: (props.placeLabel as string | null) ?? null,
      thumbUrl: (props.thumbUrl as string | null) ?? null,
    });
  };

  const onContactPress = async (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const feature = e.nativeEvent.features[0];
    if (!feature) return;
    if (feature.properties?.cluster) return expandCluster(contactSourceRef, feature);
    // MapLibre stringifies nested properties, so the id array comes back as JSON.
    const raw = feature.properties?.contactIds;
    const ids = typeof raw === 'string' ? (JSON.parse(raw) as string[]) : (raw as string[] | undefined);
    if (ids?.length) navigation.navigate('ContactDetail', { contactId: ids[0] });
  };

  const onVisitPress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const props = e.nativeEvent.features[0]?.properties;
    if (!props) return;
    setOpenVisit({
      placeLabel: (props.placeLabel as string | null) ?? null,
      arriveTs: String(props.arriveTs),
      departTs: String(props.departTs),
      durationMin: Number(props.durationMin),
    });
  };

  const onHotspotPress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const props = e.nativeEvent.features[0]?.properties;
    if (!props) return;
    setOpenHotspot({
      label: (props.label as string | null) ?? null,
      activeDays: Number(props.activeDays),
      eventCount: Number(props.eventCount),
      photoCount: Number(props.photoCount),
      firstDay: String(props.firstDay),
      lastDay: String(props.lastDay),
    });
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

  const toggle = (key: LayerKey) => setEnabled((s) => ({ ...s, [key]: !s[key] }));
  const mapStyle = style ?? (degraded ? fallbackStyle(theme) : undefined);

  return (
    <View style={[styles.root, { backgroundColor: paper.colors.background }]}>
      {degraded && (
        <Banner visible icon={ICONS.locationOff}>Basemap unavailable — showing pins on a plain background.</Banner>
      )}
      {mapStyle ? (
        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            mapStyle={mapStyle as unknown as StyleSpecification}
            onRegionDidChange={onRegionDidChange}
          >
            <Camera ref={cameraRef} initialViewState={{ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM }} />
            {/* Always mounted: a layer mounted later is appended above the pins and would steal their taps. */}
            <HotspotsLayer theme={theme} features={hotspots} onPress={onHotspotPress} />
            {enabled.movement && (
              <MovementLayer
                theme={theme}
                visits={movement.visits}
                track={movement.track}
                current={movement.current}
                onVisitPress={onVisitPress}
              />
            )}
            {enabled.saved && <SavedPlacesLayer theme={theme} features={saved} />}
            {enabled.contacts && (
              <ContactsLayer theme={theme} features={contacts} sourceRef={contactSourceRef} onPress={onContactPress} />
            )}
            {enabled.events && (
              <EventsLayer theme={theme} features={events} sourceRef={eventSourceRef} onPress={onEventPress} />
            )}
            {enabled.photos && (
              <PhotosLayer theme={theme} features={photos} onPress={onPhotoPress} />
            )}
            {livePosition && <LivePuck theme={theme} position={livePosition} />}
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
        <LayersSheet theme={theme} enabled={enabled} onToggle={toggle} onDismiss={() => setSheetOpen(false)} />
      )}

      {openPhoto && (
        <Portal>
          <Pressable style={styles.sheetBackdrop} onPress={() => setOpenPhoto(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: paper.colors.elevation.level2 }]}>
              {openPhoto.thumbUrl && (
                <Image source={{ uri: openPhoto.thumbUrl }} style={styles.sheetImage} contentFit="cover" transition={150} />
              )}
              <Text style={[styles.sheetTitle, { color: paper.colors.onSurface }]}>
                {openPhoto.placeLabel ?? 'Unknown place'}
              </Text>
              <Text style={[styles.sheetDetail, { color: paper.colors.onSurfaceVariant }]}>
                {new Date(openPhoto.takenAt).toLocaleString()}
              </Text>
              <View style={styles.sheetActions}>
                <Button
                  title="Open photo"
                  variant="text"
                  onPress={() => {
                    const photoId = openPhoto.id;
                    setOpenPhoto(null);
                    navigation.navigate('PhotoViewer', { photoId });
                  }}
                />
                <Button
                  title="All from this day"
                  variant="text"
                  onPress={() => {
                    const day = dayKey(new Date(openPhoto.takenAt));
                    setOpenPhoto(null);
                    navigation.navigate('Tabs', { screen: 'Photos', params: { from: day, to: day } });
                  }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Portal>
      )}

      {openVisit && (
        <Portal>
          <Pressable style={styles.sheetBackdrop} onPress={() => setOpenVisit(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: paper.colors.elevation.level2 }]}>
              <Text style={[styles.sheetTitle, { color: paper.colors.onSurface }]}>
                {openVisit.placeLabel ?? 'Stay'}
              </Text>
              <Text style={[styles.sheetDetail, { color: paper.colors.onSurfaceVariant }]}>
                {new Date(openVisit.arriveTs).toLocaleTimeString()}–{new Date(openVisit.departTs).toLocaleTimeString()}
                {' · '}{openVisit.durationMin} min
              </Text>
            </Pressable>
          </Pressable>
        </Portal>
      )}

      {openHotspot && (
        <Portal>
          <Pressable style={styles.sheetBackdrop} onPress={() => setOpenHotspot(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: paper.colors.elevation.level2 }]}>
              <Text style={[styles.sheetTitle, { color: paper.colors.onSurface }]}>
                {openHotspot.label ?? 'Unnamed spot'}
              </Text>
              <Text style={[styles.sheetDetail, { color: paper.colors.onSurfaceVariant }]}>
                {hotspotStats(openHotspot)}
              </Text>
              <Text style={[styles.sheetDetail, { color: paper.colors.onSurfaceVariant }]}>
                {fmtDate(parseYmd(openHotspot.firstDay))} – {fmtDate(parseYmd(openHotspot.lastDay))}
              </Text>
            </Pressable>
          </Pressable>
        </Portal>
      )}
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
  sheetActions: { flexDirection: 'row', flexWrap: 'wrap' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 4 },
  sheetImage: { width: '100%', height: 240, borderRadius: 12, marginBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '600' },
  sheetDetail: { fontSize: 13 },
});
