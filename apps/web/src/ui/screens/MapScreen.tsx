import 'maplibre-gl/dist/maplibre-gl.css';
import { Marker, type GeoJSONSource, type MapGeoJSONFeature, type MapMouseEvent } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import ViewListIcon from '@mui/icons-material/ViewList';
import type { Bbox, MapViewport } from '@lupira/cal-domain/geo';
import { photoCellBounds } from '@lupira/cal-domain/mapFeatures';
import type { HitAction } from '@lupira/cal-domain/mapHitLabels';
import { hitsFromFeatures, type MapHit } from '@lupira/cal-domain/mapHits';
import { CELL_PADDING_PX, PIN_CLUSTERS, TARGET_ZOOM, zoomForSpan } from '@lupira/cal-domain/mapZoom';
import type { QuickPlace } from '@lupira/cal-domain/quickPlaces';
import { dayEndIso, dayStartIso, ymd } from '@lupira/cal-domain/time';
import { DEFAULT_LAYERS, LAYER_KEYS, isLayerKey, type LayerKey } from '@lupira/cal-tokens/mapLayers';
import { readPref, writePref } from '../../state/localPrefs';
import {
  useContactFeatures,
  useEventFeatures,
  useHotspotFeatures,
  useMovementFeatures,
  usePhotoFeatures,
  useSavedPlaceFeatures,
} from '../../state/useMapData';
import { useQuickPlaces } from '../../state/useQuickPlaces';
import { MapCanvas, useMap, useMapTheme } from '../components/map/MapCanvas';
import {
  DEFAULT_PRESET,
  LayerToggles,
  TimeRangeBar,
  presetOf,
  presetRange,
  type DateRange,
} from '../components/map/MapControls';
import { MapHitsCard } from '../components/map/MapHitsCard';
import { MapIndexPanel, type IndexGroup } from '../components/map/MapIndexPanel';
import { MapPopover } from '../components/map/MapPopover';
import { MapSearch, type SearchTarget } from '../components/map/MapSearch';
import { PlaceDetailPanel } from '../components/map/PlaceDetailPanel';
import {
  ContactsLayer,
  EventsLayer,
  FormerContactsLayer,
  HotspotsLayer,
  INTERACTIVE_LAYER_IDS,
  MovementLayer,
  PhotosLayer,
  SavedPlacesLayer,
} from '../components/map/layers';
import { FitToData, FlyToPlace, ViewportReporter } from '../components/map/mapEffects';
import { EventIcon, HomeIcon, WorkIcon } from '../icons';

const SELECTION_KEYS = ['place', 'item', 'at'];
const LAYERS_PREF = 'map.layers';
const RANGE_PREF = 'map.range';
const DEFAULT_ACTIVE = LAYER_KEYS.filter((k) => DEFAULT_LAYERS[k]);
/** A click this close to a pin counts as on it. */
const HIT_RADIUS = 10;

/** Where to take the camera: a point at a zoom, a point framed by ground span, or a photo cell's bounds. */
type FlyTarget = { center: [number, number]; zoom?: number; spanM?: number; bounds?: Bbox };

/** The map over everything located: events, GPS movement, contacts, saved places, photos, hotspots. Route stays
 * /locations so ?place=/?q= deep links keep working; state rides the URL (?from ?to ?layers), and the layers and
 * range you pick are remembered for when it names none. A click lists everything under it; the strip under the
 * controls jumps to your home, work and next events. */
export default function MapScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useMapTheme();
  const selectedPlaceId = params.get('place') ?? undefined;

  const setParam = useCallback((key: string, value: string | undefined) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true }), [setParams]);

  // One selection at a time: each flies the map on load, so leaving an older one in the URL makes a
  // reload return to it instead of to what was picked last.
  const select = useCallback((key: 'place' | 'item', value: string | undefined) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const k of SELECTION_KEYS) next.delete(k);
      if (value) next.set(key, value);
      return next;
    }, { replace: true }), [setParams]);

  const range: DateRange = useMemo(() => {
    const from = params.get('from');
    const to = params.get('to');
    if (from && to) return { fromYmd: from, toYmd: to };
    return presetRange(readPref(RANGE_PREF) ?? DEFAULT_PRESET) ?? presetRange(DEFAULT_PRESET)!;
  }, [params]);
  const setRange = (r: DateRange) => {
    writePref(RANGE_PREF, presetOf(r) ?? null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('from', r.fromYmd);
      next.set('to', r.toYmd);
      return next;
    }, { replace: true });
  };

  // 'none' is a choice, not an absence — without it, turning the last layer off would bring the defaults back.
  const activeLayers: LayerKey[] = useMemo(() => {
    const raw = params.get('layers') ?? readPref(LAYERS_PREF);
    if (raw === 'none') return [];
    const keys = raw?.split(',').filter(isLayerKey);
    return keys?.length ? keys : DEFAULT_ACTIVE;
  }, [params]);
  const toggleLayer = (key: LayerKey) => {
    const next = activeLayers.includes(key) ? activeLayers.filter((k) => k !== key) : [...activeLayers, key];
    const value = next.length ? next.join(',') : 'none';
    writePref(LAYERS_PREF, value);
    setParam('layers', value);
  };

  // Inclusive local dates → half-open UTC instants for the APIs.
  const fromIso = useMemo(() => dayStartIso(range.fromYmd), [range.fromYmd]);
  const toIso = useMemo(() => dayEndIso(range.toYmd), [range.toYmd]);

  const events = useEventFeatures(fromIso, toIso, activeLayers.includes('events'));
  const movement = useMovementFeatures(fromIso, toIso, activeLayers.includes('movement'));
  const contacts = useContactFeatures(activeLayers.includes('contacts'));
  const saved = useSavedPlaceFeatures(activeLayers.includes('saved'));
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const photos = usePhotoFeatures(viewport, fromIso, toIso, activeLayers.includes('photos'));
  const hotspots = useHotspotFeatures(fromIso, toIso, activeLayers.includes('hotspots'));
  const [now] = useState(() => new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString());
  const quickPlaces = useQuickPlaces(now);

  const [hits, setHits] = useState<{ list: MapHit[]; at: [number, number] }>();
  const [selected, setSelected] = useState<[number, number]>();
  const [flyTarget, setFlyTarget] = useState<FlyTarget>();
  const popoverAnchor = useMemo(() => (hits ? { lngLat: hits.at } : undefined), [hits]);
  const closeHits = useCallback(() => {
    setHits(undefined);
    setSelected(undefined);
  }, []);
  const openPlace = useCallback((placeId: string) => {
    setHits(undefined);
    select('place', placeId);
  }, [select]);
  const onHits = useCallback((list: MapHit[]) => {
    if (list.length === 0) {
      closeHits();
      return;
    }
    const point: [number, number] = [list[0].point.lon, list[0].point.lat];
    setSelected(point);
    setHits({ list, at: point });
  }, [closeHits]);

  const onHitAction = (hit: MapHit, action: HitAction) => {
    if (action === 'zoom' && hit.kind === 'photoCell') {
      closeHits();
      setFlyTarget({ center: [hit.point.lon, hit.point.lat], bounds: hit.bounds });
      return;
    }
    if (action === 'day' && (hit.kind === 'photo' || hit.kind === 'visit')) {
      const day = ymd(new Date(hit.kind === 'photo' ? hit.takenAt : hit.arriveTs));
      navigate(`/photos?from=${day}&to=${day}`);
      return;
    }
    if (action === 'place' && (hit.kind === 'saved' || hit.kind === 'hotspot') && hit.placeId) {
      openPlace(hit.placeId);
      return;
    }
    if (action !== 'open') return;
    setHits(undefined);
    if (hit.kind === 'event') select('item', hit.itemId);
    else if (hit.kind === 'contact') navigate(`/contacts/${hit.contactId}`);
    else if (hit.kind === 'photo') navigate(`/photos?photo=${hit.photoId}`);
  };

  const onQuickPick = (p: QuickPlace) => {
    if (!p.point) return;
    const center: [number, number] = [p.point.lon, p.point.lat];
    setFlyTarget({ center, spanM: p.spanM });
    setSelected(center);
    setHits(p.event
      ? { list: [{ kind: 'event', key: p.key, point: p.point, ...p.event }], at: center }
      : undefined);
  };

  const onSearchPick = (target: SearchTarget) => {
    select('place', target.placeId);
    setFlyTarget({ center: [target.lon, target.lat] });
  };

  // ?at=lon,lat flies to one point and pins it — how the gallery hands a photo over.
  const atParam = params.get('at');
  const [appliedAtParam, setAppliedAtParam] = useState<string | null>(null);
  if (atParam !== appliedAtParam) {
    setAppliedAtParam(atParam);
    const at = parseAt(atParam);
    if (at) {
      setFlyTarget({ center: at, zoom: TARGET_ZOOM });
      setSelected(at);
    }
  }

  const fitCollections = useMemo(
    () => [events.features, movement.visits, contacts.features, saved.features],
    [events.features, movement.visits, contacts.features, saved.features],
  );
  // A deep link already aimed the camera; turning a layer on later must not pull it away.
  const deepLinked = !!selectedPlaceId || !!atParam || !!params.get('item');
  const anyLoading = events.isLoading || movement.isLoading || contacts.isLoading || saved.isLoading || photos.isLoading
    || hotspots.isLoading;

  const showIndex = params.get('index') === '1';
  const showHistory = params.get('history') === '1';
  const indexGroups = useMemo<IndexGroup[]>(() => {
    const flyTo = (feature: GeoJSON.Feature, placeId?: unknown) => () => {
      const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates;
      setFlyTarget({ center: [lon, lat] });
      if (typeof placeId === 'string' && placeId) select('place', placeId);
    };

    // Contacts grouped per (deduped) address kind — mixed-kind households land under the joined kind.
    const byKind = new Map<string, IndexGroup['rows']>();
    for (const f of contacts.features.features) {
      const p = f.properties!;
      const kind = [...new Set((p.addressTypes as string[]) ?? [])].join('/') || 'Other';
      const rows = byKind.get(kind) ?? [];
      rows.push({
        key: `c:${p.placeId}`,
        primary: ((p.names as string[]) ?? []).join(', '),
        secondary: p.placeName as string,
        onClick: flyTo(f, p.placeId),
      });
      byKind.set(kind, rows);
    }
    const contactGroups = [...byKind.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, rows]) => ({ title: `Contacts · ${kind}`, rows: rows.sort((a, b) => a.primary.localeCompare(b.primary)) }));

    const savedRows = saved.features.features.map((f) => {
      const p = f.properties!;
      return {
        key: `s:${p.savedPlaceId}`,
        primary: p.icon ? `${p.icon} ${p.label}` : p.label,
        onClick: flyTo(f, p.placeId),
      };
    });

    const eventRows = events.features.features.map((f) => {
      const p = f.properties!;
      return {
        key: `e:${p.itemId}:${p.start}`,
        primary: p.title as string,
        secondary: p.placeName as string,
        onClick: () => {
          const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
          setFlyTarget({ center: [lon, lat] });
          select('item', p.itemId as string);
        },
      };
    });

    const historyRow = (f: GeoJSON.Feature) => {
      const p = f.properties!;
      return {
        key: `cf:${p.placeId}:${p.status}`,
        primary: ((p.names as string[]) ?? []).join(', '),
        secondary: `${((p.periods as string[]) ?? []).join(', ')} · ${p.placeName}`,
        onClick: flyTo(f, p.placeId),
      };
    };
    const formerFeatures = contacts.former.features;
    const historyFeatures = showHistory ? formerFeatures : [];
    const formerRows = historyFeatures.filter((f) => f.properties!.status === 'former').map(historyRow);
    const upcomingRows = historyFeatures.filter((f) => f.properties!.status === 'future').map(historyRow);

    return [
      ...contactGroups,
      { title: 'Contacts · Upcoming', rows: upcomingRows },
      { title: 'Contacts · Former', rows: formerRows },
      { title: 'Saved places', rows: savedRows },
      { title: 'Events in range', rows: eventRows },
    ];
  }, [contacts.features, contacts.former, showHistory, saved.features, events.features, select]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
      <MapCanvas>
        {activeLayers.includes('hotspots') && <HotspotsLayer theme={theme} features={hotspots.features} />}
        {activeLayers.includes('movement') && (
          <MovementLayer theme={theme} visits={movement.visits} track={movement.track} current={movement.current} />
        )}
        {activeLayers.includes('events') && <EventsLayer theme={theme} features={events.features} />}
        {activeLayers.includes('contacts') && showHistory && <FormerContactsLayer theme={theme} features={contacts.former} />}
        {activeLayers.includes('contacts') && <ContactsLayer theme={theme} features={contacts.features} />}
        {activeLayers.includes('saved') && <SavedPlacesLayer theme={theme} features={saved.features} />}
        {activeLayers.includes('photos') && <PhotosLayer theme={theme} features={photos.features} />}
        {activeLayers.includes('photos') && <ViewportReporter onChange={setViewport} />}
        <MapClicks onHits={onHits} />
        <SelectionMarker point={selected} />
        <FlyToPlace placeId={selectedPlaceId} onLocated={setSelected} />
        {flyTarget && <FlyToPoint target={flyTarget} />}
        <FitToData collections={fitCollections} skip={deepLinked} />
        {hits && popoverAnchor && (
          <MapPopover anchor={popoverAnchor} onClose={closeHits}>
            <MapHitsCard hits={hits.list} theme={theme} onAction={onHitAction} onOpenPlace={openPlace} />
          </MapPopover>
        )}
      </MapCanvas>

      <Box
        sx={{
          position: 'absolute',
          zIndex: 6,
          top: 1.5,
          left: 1.5,
          right: { xs: 1.5, sm: '56px' },
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'flex-start',
          pointerEvents: 'none',
          '& > *': { pointerEvents: 'auto' },
        }}
      >
        <MapSearch onPick={onSearchPick} />
        <TimeRangeBar range={range} onChange={setRange} />
        <LayerToggles
          active={activeLayers}
          onToggle={toggleLayer}
          theme={theme}
          unmappableCount={events.unmappableCount}
          showHistory={showHistory}
          onToggleHistory={() => setParam('history', showHistory ? undefined : '1')}
        />
        <Chip
          variant={showIndex ? 'filled' : 'outlined'}
          color={showIndex ? 'primary' : 'default'}
          onClick={() => setParam('index', showIndex ? undefined : '1')}
          icon={<ViewListIcon />}
          label="List"
        />
        {anyLoading && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Loading…</Typography>}
        <QuickPlacesBar places={quickPlaces} onPick={onQuickPick} />
      </Box>

      {showIndex && <MapIndexPanel groups={indexGroups} onClose={() => setParam('index', undefined)} />}

      {selectedPlaceId && (
        <PlaceDetailPanel
          placeId={selectedPlaceId}
          onClose={() => {
            setParam('place', undefined);
            setSelected(undefined);
          }}
        />
      )}
    </Box>
  );
}

/** Jump targets — your home and work, then what's coming up; scrolls sideways when they don't fit. */
function QuickPlacesBar({ places, onPick }: { places: QuickPlace[]; onPick: (p: QuickPlace) => void }) {
  if (places.length === 0) return null;
  return (
    <Box sx={{ flexBasis: '100%', display: 'flex', gap: 0.5, overflowX: 'auto', pb: 0.5, scrollbarWidth: 'none' }}>
      {places.map((p) => {
        const Icon = p.kind === 'home' ? HomeIcon : p.kind === 'work' ? WorkIcon : EventIcon;
        return (
          <Chip
            key={p.key}
            label={p.label}
            disabled={!p.point}
            onClick={() => onPick(p)}
            icon={<Icon style={p.event?.color ? { color: p.event.color } : undefined} />}
            sx={{ flex: 'none', bgcolor: 'background.paper', boxShadow: 1 }}
          />
        );
      })}
    </Box>
  );
}

/** Every click resolves against all interactive layers at once, so stacked pins answer as one list. A
 *  cluster that can still split zooms in; one that can't (pins on one spot) lists its members; a lone photo
 *  cell zooms to its photos. */
function MapClicks({ onHits }: { onHits: (hits: MapHit[]) => void }) {
  const map = useMap();
  useEffect(() => {
    const onClick = async (e: MapMouseEvent) => {
      const { x, y } = e.point;
      const layers = INTERACTIVE_LAYER_IDS.filter((id) => map.getLayer(id));
      const features: MapGeoJSONFeature[] = layers.length === 0 ? [] : map.queryRenderedFeatures(
        [[x - HIT_RADIUS, y - HIT_RADIUS], [x + HIT_RADIUS, y + HIT_RADIUS]],
        { layers },
      );
      const found: GeoJSON.Feature[] = [];
      let expand: { feature: GeoJSON.Feature; zoom: number } | undefined;
      for (const f of features) {
        if (!f.properties?.cluster) {
          found.push(f);
          continue;
        }
        const source = map.getSource(f.source) as GeoJSONSource;
        const clusterId = f.properties.cluster_id as number;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        if (zoom <= PIN_CLUSTERS.maxZoom) expand ??= { feature: f, zoom };
        else found.push(...(await source.getClusterLeaves(clusterId, PIN_CLUSTERS.leaves, 0)));
      }

      const hits = hitsFromFeatures(found);
      if (hits.length === 0 && expand) {
        const [lon, lat] = (expand.feature.geometry as GeoJSON.Point).coordinates;
        map.easeTo({ center: [lon, lat], zoom: expand.zoom });
        return;
      }
      if (hits.length === 1 && hits[0].kind === 'photoCell') {
        map.fitBounds(photoCellBounds(hits[0].bounds), { padding: CELL_PADDING_PX, duration: 400 });
        return;
      }
      onHits(hits);
    };
    const handler = (e: MapMouseEvent) => void onClick(e);
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [map, onHits]);
  return null;
}

/** A pin over what is selected — the dot clicked, or the point or place a link sent you to. */
function SelectionMarker({ point }: { point: [number, number] | undefined }) {
  const map = useMap();
  const color = useTheme().palette.primary.main;
  const [lon, lat] = point ?? [];
  useEffect(() => {
    if (lon == null || lat == null) return;
    const marker = new Marker({ color }).setLngLat([lon, lat]).addTo(map);
    return () => { marker.remove(); };
  }, [map, lon, lat, color]);
  return null;
}

function parseAt(raw: string | null): [number, number] | undefined {
  const [lon, lat] = (raw ?? '').split(',').map(Number);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : undefined;
}

function FlyToPoint({ target }: { target: FlyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (target.bounds) {
      map.fitBounds(photoCellBounds(target.bounds), { padding: CELL_PADDING_PX, duration: 400 });
      return;
    }
    const [lon, lat] = target.center;
    const zoom = target.spanM != null
      ? zoomForSpan(target.spanM, map.getContainer().clientWidth, lat)
      : target.zoom ?? Math.max(map.getZoom(), 13);
    map.flyTo({ center: [lon, lat], zoom });
  }, [map, target]);
  return null;
}
