import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { type FuzzyDate, fmtFuzzyDate, fmtResidencyPeriod, residencyStatus } from './fuzzyDate';
import { splitTrack, type TrackPointLike } from './geo';

// Row-to-GeoJSON projection for the map, shared by web and mobile. Both read the same layers from
// different sources — web from the API, mobile from the SQLite mirror — so only the source is
// per-app; the feature properties are a contract with the layer styles and must not diverge.
// Inputs are local shapes, never generated DTOs, so each app maps its own rows in.

export const EMPTY_FEATURES: FeatureCollection = { type: 'FeatureCollection', features: [] };

export interface PlacePoint {
  id: string;
  name?: string | null;
  longitude?: number | null;
  latitude?: number | null;
}

function point(lon: number, lat: number, properties: Record<string, unknown>): Feature<Point> {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties };
}

/** A place the lookup resolved but never geocoded has no coordinates, so it cannot be drawn. */
function located(place: PlacePoint | undefined): place is PlacePoint & { longitude: number; latitude: number } {
  return place != null && place.longitude != null && place.latitude != null;
}

const collect = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });

export interface EventPin {
  itemId: string;
  title?: string | null;
  start: string;
  calendarId?: string | null;
  color?: string | null;
  placeId?: string | null;
  /** Free-text location with no resolved place (CalDAV imports) — counted, never drawn. */
  hasLocationLabel?: boolean;
}

export function eventFeatures(
  pins: readonly EventPin[],
  places: ReadonlyMap<string, PlacePoint>,
): { features: FeatureCollection; unmappableCount: number } {
  const features: Feature<Point>[] = [];
  const seen = new Set<string>(); // one pin per (item, place) — recurring items repeat occurrences
  let unmappableCount = 0;

  for (const pin of pins) {
    const place = pin.placeId ? places.get(pin.placeId) : undefined;
    if (!located(place)) {
      if (!pin.placeId && pin.hasLocationLabel) unmappableCount++;
      continue;
    }
    const key = `${pin.itemId}:${place.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push(point(place.longitude, place.latitude, {
      layer: 'event',
      itemId: pin.itemId,
      title: pin.title ?? place.name,
      start: pin.start,
      calendarId: pin.calendarId ?? null,
      color: pin.color ?? null,
      placeId: place.id,
      placeName: place.name,
    }));
  }
  return { features: collect(features), unmappableCount };
}

/** "Astrid Park, Erik Park · Home" — households share a pin; the kind list dedupes (usually to one). */
export function contactPinLabel(names: readonly string[], types: readonly string[]): string {
  const shown = names.length > 3 ? [...names.slice(0, 2), `+${names.length - 2}`] : [...names];
  const kinds = [...new Set(types)];
  return kinds.length ? `${shown.join(', ')} · ${kinds.join('/')}` : shown.join(', ');
}

export interface ContactAddressPin {
  contactId: string;
  displayName: string;
  placeId?: string | null;
  addressType?: string | null;
  movedIn?: FuzzyDate | null;
  movedOut?: FuzzyDate | null;
}

interface Household {
  placeId: string;
  status: string;
  names: string[];
  contactIds: string[];
  types: string[];
  periods: string[];
}

/**
 * Co-located contacts merge into one pin. Active pins group per place; former and future group per
 * (place, status) so a single pin never mixes two residency states.
 */
export function contactFeatures(
  rows: readonly ContactAddressPin[],
  places: ReadonlyMap<string, PlacePoint>,
): { features: FeatureCollection; former: FeatureCollection } {
  const group = (wantActive: boolean) => {
    const byKey = new Map<string, Household>();
    for (const row of rows) {
      const status = residencyStatus(row.movedIn, row.movedOut);
      if ((status === 'active') !== wantActive) continue;
      if (!row.placeId || !located(places.get(row.placeId))) continue;
      const key = wantActive ? row.placeId : `${row.placeId}|${status}`;
      const entry = byKey.get(key)
        ?? { placeId: row.placeId, status, names: [], contactIds: [], types: [], periods: [] };
      entry.names.push(row.displayName);
      entry.contactIds.push(row.contactId);
      if (row.addressType) entry.types.push(row.addressType);
      entry.periods.push(status === 'future' && row.movedIn
        ? `from ${fmtFuzzyDate(row.movedIn)}`
        : fmtResidencyPeriod(row.movedIn, row.movedOut));
      byKey.set(key, entry);
    }
    return byKey;
  };

  const toFeatures = (byKey: Map<string, Household>, layer: 'contact' | 'contact-former') =>
    [...byKey.values()].flatMap((entry) => {
      const place = places.get(entry.placeId);
      if (!located(place)) return [];
      const label = contactPinLabel(entry.names, entry.types);
      return point(place.longitude, place.latitude, {
        layer,
        status: entry.status,
        placeId: entry.placeId,
        placeName: place.name,
        names: entry.names,
        contactIds: entry.contactIds,
        addressTypes: entry.types,
        periods: entry.periods,
        label: layer === 'contact' ? label : `${label} · ${[...new Set(entry.periods)].join(', ')}`,
      });
    });

  return {
    features: collect(toFeatures(group(true), 'contact')),
    former: collect(toFeatures(group(false), 'contact-former')),
  };
}

export interface VisitPin {
  id: string;
  lat: number;
  lon: number;
  placeLabel?: string | null;
  arriveTs: string;
  departTs: string;
  radiusM?: number | null;
}

export function visitFeatures(visits: readonly VisitPin[]): FeatureCollection {
  return collect(visits.map((v) => point(v.lon, v.lat, {
    layer: 'visit',
    visitId: v.id,
    placeLabel: v.placeLabel ?? null,
    arriveTs: v.arriveTs,
    departTs: v.departTs,
    // Rounded and floored at 1: a dwell is never usefully shown as "0 min".
    durationMin: Math.max(1, Math.round((Date.parse(v.departTs) - Date.parse(v.arriveTs)) / 60_000)),
    radiusM: v.radiusM ?? null,
  })));
}

export function trackFeatures(points: readonly TrackPointLike[], maxGapS: number): FeatureCollection {
  const segments = splitTrack(points, maxGapS).filter((segment) => segment.length >= 2);
  return collect(segments.map((segment): Feature<LineString> => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: segment.map((p) => [p.lon, p.lat]) },
    properties: { layer: 'track', activity: segment[0].activity ?? 'Unknown' },
  })));
}

export interface CurrentFix {
  deviceId: string;
  lat: number;
  lon: number;
  ts: string;
  batteryPct?: number | null;
}

export function currentFixFeatures(fixes: readonly CurrentFix[]): FeatureCollection {
  return collect(fixes.map((fix) => point(fix.lon, fix.lat, {
    layer: 'current',
    deviceId: fix.deviceId,
    ts: fix.ts,
    batteryPct: fix.batteryPct ?? null,
  })));
}

export interface SavedPlacePin {
  id: string;
  placeId?: string | null;
  label: string;
  icon?: string | null;
  isFavorite: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export function savedPlaceFeatures(saved: readonly SavedPlacePin[]): FeatureCollection {
  return collect(saved
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => point(s.longitude!, s.latitude!, {
      layer: 'saved',
      savedPlaceId: s.id,
      placeId: s.placeId ?? null,
      label: s.label,
      icon: s.icon ?? null,
      isFavorite: s.isFavorite,
    })));
}

export interface HotspotPin {
  id: string;
  latitude: number;
  longitude: number;
  placeId?: string | null;
  label?: string | null;
  activeDays: number;
  eventCount: number;
  photoCount: number;
  firstDay: string;
  lastDay: string;
}

export function hotspotFeatures(hotspots: readonly HotspotPin[]): FeatureCollection {
  return collect(hotspots.map((h) => point(h.longitude, h.latitude, {
    layer: 'hotspot',
    hotspotId: h.id,
    placeId: h.placeId ?? null,
    label: h.label ?? null,
    activeDays: h.activeDays,
    eventCount: h.eventCount,
    photoCount: h.photoCount,
    firstDay: h.firstDay,
    lastDay: h.lastDay,
  })));
}

const counted = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** "12 days · 3 events · 80 photos" — a zero count is left out, the day count never is. */
export function hotspotStats(h: Pick<HotspotPin, 'activeDays' | 'eventCount' | 'photoCount'>): string {
  return [
    counted(h.activeDays, 'day'),
    h.eventCount > 0 ? counted(h.eventCount, 'event') : null,
    h.photoCount > 0 ? counted(h.photoCount, 'photo') : null,
  ].filter(Boolean).join(' · ');
}

/** The photo endpoint already answers GeoJSON; this re-keys its properties onto the layer contract. */
export interface PhotoMapFeature {
  geometry: { coordinates: number[] };
  properties: {
    id: string;
    kind: string;
    takenAt?: string | null;
    placeLabel?: string | null;
    thumbUrl?: string | null;
  };
}

export function photoFeatures(features: readonly PhotoMapFeature[]): FeatureCollection {
  return collect(features.map((f) => point(f.geometry.coordinates[0], f.geometry.coordinates[1], {
    layer: 'photo',
    photoId: f.properties.id,
    kind: f.properties.kind,
    takenAt: f.properties.takenAt ?? null,
    placeLabel: f.properties.placeLabel ?? null,
    thumbUrl: f.properties.thumbUrl ?? null,
  })));
}
