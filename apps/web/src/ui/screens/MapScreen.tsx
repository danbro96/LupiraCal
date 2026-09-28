import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ViewListIcon from '@mui/icons-material/ViewList';
import { hotspotStats } from '@lupira/cal-domain/mapFeatures';
import { addDays, fmtDate, fmtTime, parseYmd, ymd } from '@lupira/cal-domain/time';
import {
  useContactFeatures,
  useEventFeatures,
  useHotspotFeatures,
  useMovementFeatures,
  usePhotoFeatures,
  useSavedPlaceFeatures,
} from '../../state/useMapData';
import { MapCanvas, useMap, useMapTheme } from '../components/map/MapCanvas';
import {
  DEFAULT_LAYERS,
  LayerToggles,
  TimeRangeBar,
  defaultRange,
  type DateRange,
  type LayerKey,
} from '../components/map/MapControls';
import { MapIndexPanel, type IndexGroup } from '../components/map/MapIndexPanel';
import { MapPopover } from '../components/map/MapPopover';
import { MapSearch, type SearchTarget } from '../components/map/MapSearch';
import { PlaceDetailPanel } from '../components/map/PlaceDetailPanel';
import {
  ContactsLayer,
  EventsLayer,
  FormerContactsLayer,
  HotspotsLayer,
  MovementLayer,
  PhotosLayer,
  SavedPlacesLayer,
  type PinSelection,
} from '../components/map/layers';
import { FitToData, FlyToPlace, ViewportReporter } from '../components/map/mapEffects';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { Row, RowName } from '../components/Rows';
import { WrapRow } from '../components/WrapRow';
import Button from '@mui/material/Button';
import { useInvalidatePlaces } from '../../state/useInvalidate';
import { useCreatePlaceAtPin } from '../../state/usePlaces';
import { useSnackbar } from '../components/SnackbarHost';
import { errText } from '../errText';

const SELECTION_KEYS = ['place', 'item', 'at'];

/** The map over everything located: events, GPS movement, contacts, saved places. Route stays
 * /locations so ?place=/?q= deep links keep working; state rides the URL (?from ?to ?layers). */
export default function MapScreen() {
  const [params, setParams] = useSearchParams();
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
    return from && to ? { fromYmd: from, toYmd: to } : defaultRange();
  }, [params]);
  const setRange = (r: DateRange) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('from', r.fromYmd);
      next.set('to', r.toYmd);
      return next;
    }, { replace: true });

  const activeLayers: LayerKey[] = useMemo(() => {
    const raw = params.get('layers');
    return raw ? (raw.split(',').filter(Boolean) as LayerKey[]) : DEFAULT_LAYERS;
  }, [params]);
  const toggleLayer = (key: LayerKey) => {
    const next = activeLayers.includes(key)
      ? activeLayers.filter((k) => k !== key)
      : [...activeLayers, key];
    setParam('layers', next.join(','));
  };

  // Inclusive local dates → half-open UTC instants for the APIs.
  const fromIso = useMemo(() => parseYmd(range.fromYmd).toISOString(), [range.fromYmd]);
  const toIso = useMemo(() => addDays(parseYmd(range.toYmd), 1).toISOString(), [range.toYmd]);

  const events = useEventFeatures(fromIso, toIso, activeLayers.includes('events'));
  const movement = useMovementFeatures(fromIso, toIso, activeLayers.includes('movement'));
  const contacts = useContactFeatures(activeLayers.includes('contacts'));
  const saved = useSavedPlaceFeatures(activeLayers.includes('saved'));
  // Photos are viewport-scoped rather than range-scoped: the endpoint caps its result set, so the
  // bbox is what keeps a large library usable.
  const [bbox, setBbox] = useState<string | null>(null);
  const photos = usePhotoFeatures(bbox, activeLayers.includes('photos'));
  const hotspots = useHotspotFeatures(activeLayers.includes('hotspots'));

  const [popover, setPopover] = useState<PinSelection>();
  const onSelect = useCallback((selection: PinSelection) => setPopover(selection), []);
  const openItem = useCallback((itemId: string) => select('item', itemId), [select]);
  const openPlace = useCallback((placeId: string) => {
    setPopover(undefined);
    select('place', placeId);
  }, [select]);

  const onSearchPick = (target: SearchTarget) => {
    select('place', target.placeId);
    setFlyTarget([target.lon, target.lat]);
  };
  const [flyTarget, setFlyTarget] = useState<[number, number]>();

  // ?at=lon,lat centres the map on one point — how the gallery hands a photo over.
  const atParam = params.get('at');
  useEffect(() => {
    const at = parseAt(atParam);
    if (at) setFlyTarget(at);
  }, [atParam]);

  const fitCollections = useMemo(
    () => [events.features, movement.visits, contacts.features, saved.features],
    [events.features, movement.visits, contacts.features, saved.features],
  );
  const anyLoading = events.isLoading || movement.isLoading || contacts.isLoading || saved.isLoading || photos.isLoading
    || hotspots.isLoading;

  const showIndex = params.get('index') === '1';
  const showHistory = params.get('history') === '1';
  const indexGroups = useMemo<IndexGroup[]>(() => {
    const flyTo = (feature: GeoJSON.Feature, placeId?: unknown) => () => {
      const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates;
      setFlyTarget([lon, lat]);
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
          setFlyTarget([lon, lat]);
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
    const historyFeatures = showHistory ? contacts.former.features : [];
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
        {activeLayers.includes('hotspots') && (
          <HotspotsLayer theme={theme} features={hotspots.features} onSelect={onSelect} onOpenPlace={openPlace} />
        )}
        {activeLayers.includes('movement') && (
          <MovementLayer theme={theme} visits={movement.visits} track={movement.track} current={movement.current} onSelect={onSelect} />
        )}
        {activeLayers.includes('events') && (
          <EventsLayer theme={theme} features={events.features} onOpenItem={openItem} />
        )}
        {activeLayers.includes('contacts') && showHistory && (
          <FormerContactsLayer theme={theme} features={contacts.former} onSelect={onSelect} />
        )}
        {activeLayers.includes('contacts') && (
          <ContactsLayer theme={theme} features={contacts.features} onSelect={onSelect} />
        )}
        {activeLayers.includes('saved') && (
          <SavedPlacesLayer theme={theme} features={saved.features} onSelect={onSelect} onOpenPlace={openPlace} />
        )}
        {activeLayers.includes('photos') && (
          <PhotosLayer theme={theme} features={photos.features} onSelect={onSelect} />
        )}
        {activeLayers.includes('photos') && <ViewportReporter onChange={setBbox} />}
        <FlyToPlace placeId={selectedPlaceId} />
        <FlyTo target={flyTarget} />
        <FitToData collections={fitCollections} skip={!!selectedPlaceId} />
        {popover && (
          <MapPopover anchor={{ lngLat: popover.lngLat }} onClose={() => setPopover(undefined)}>
            <PopoverBody selection={popover} onOpenPlace={openPlace} />
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
      </Box>

      {showIndex && <MapIndexPanel groups={indexGroups} onClose={() => setParam('index', undefined)} />}

      {selectedPlaceId && (
        <PlaceDetailPanel placeId={selectedPlaceId} onClose={() => setParam('place', undefined)} />
      )}
    </Box>
  );
}

function PopoverBody({ selection, onOpenPlace }: { selection: PinSelection; onOpenPlace: (placeId: string) => void }) {
  const { kind, props } = selection;
  if (kind === 'hotspot') return <HotspotSummary props={props} onSaved={onOpenPlace} />;
  if (kind === 'contact' || kind === 'contact-former') {
    const names = (props.names as string[]) ?? [];
    const ids = (props.contactIds as string[]) ?? [];
    const periods = (props.periods as string[]) ?? [];
    return (
      <>
        {props.placeName != null && <h4>{String(props.placeName)}</h4>}
        {names.map((name, i) => (
          <Row component={Link} key={ids[i] ?? name} to={`/contacts/${ids[i]}`}>
            <RowName>{name}</RowName>
            {kind === 'contact-former' && periods[i] && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{periods[i]}</Typography>}
          </Row>
        ))}
      </>
    );
  }
  if (kind === 'visit') {
    const arrive = props.arriveTs ? fmtTime(new Date(String(props.arriveTs))) : '';
    const depart = props.departTs ? fmtTime(new Date(String(props.departTs))) : '';
    return (
      <>
        <h4>{String(props.placeLabel ?? 'Stay')}</h4>
        <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">{arrive}–{depart} · {String(props.durationMin)} min</Typography>
      </>
    );
  }
  if (kind === 'current') {
    return (
      <>
        <h4>Current position</h4>
        <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">
          {props.ts ? fmtTime(new Date(String(props.ts))) : ''}
          {props.batteryPct != null ? ` · ${String(props.batteryPct)}%` : ''}
        </Typography>
      </>
    );
  }
  if (kind === 'photo') {
    return (
      <>
        {props.thumbUrl != null && (
          <Box
            component="img"
            src={String(props.thumbUrl)}
            alt=""
            loading="lazy"
            sx={{ display: 'block', width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: '6px', mb: 1 }}
          />
        )}
        <h4>{String(props.placeLabel ?? 'Unknown place')}</h4>
        <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">
          {props.takenAt ? new Date(String(props.takenAt)).toLocaleString() : ''}
          {props.kind === 'Video' ? ' · video' : ''}
        </Typography>
        <WrapRow>
          <Button size="small" component={Link} to={`/photos?photo=${String(props.photoId)}`}>Open photo</Button>
          {props.takenAt != null && (
            <Button
              size="small"
              component={Link}
              to={`/photos?from=${ymd(new Date(String(props.takenAt)))}&to=${ymd(new Date(String(props.takenAt)))}`}
            >
              All from this day
            </Button>
          )}
        </WrapRow>
      </>
    );
  }
  return <h4>{props.icon ? `${String(props.icon)} ` : ''}{String(props.label ?? 'Saved place')}</h4>;
}

/** An unanchored hotspot: its weight, span, and a way to promote it to a gazetteer place. */
function HotspotSummary({ props, onSaved }: { props: Record<string, unknown>; onSaved: (placeId: string) => void }) {
  const create = useCreatePlaceAtPin();
  const invalidatePlaces = useInvalidatePlaces();
  const showSnack = useSnackbar();
  const [lon, lat] = props.center as [number, number];
  const label = props.label == null ? 'Unnamed spot' : String(props.label);
  const save = () => create.mutate({ name: label, lat, lon }, {
    onSuccess: (place) => {
      invalidatePlaces();
      onSaved(place.id);
    },
    onError: (e) => showSnack(errText(e) ?? 'Request failed.'),
  });
  return (
    <>
      <h4>{label}</h4>
      <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">
        {hotspotStats({ activeDays: props.activeDays as number, eventCount: props.eventCount as number, photoCount: props.photoCount as number })}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">
        {fmtDate(parseYmd(String(props.firstDay)))} – {fmtDate(parseYmd(String(props.lastDay)))}
      </Typography>
      <WrapRow>
        <Button size="small" onClick={save} disabled={create.isPending}>Save as place</Button>
      </WrapRow>
    </>
  );
}

function parseAt(raw: string | null): [number, number] | undefined {
  const [lon, lat] = (raw ?? '').split(',').map(Number);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : undefined;
}

function FlyTo({ target }: { target: [number, number] | undefined }) {
  return target ? <FlyToPoint target={target} /> : null;
}

function FlyToPoint({ target }: { target: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo({ center: target, zoom: Math.max(map.getZoom(), 13) });
  }, [map, target]);
  return null;
}
