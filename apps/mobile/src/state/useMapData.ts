import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FeatureCollection } from 'geojson';
import { listSavedPlaces } from '@lupira/cal-api/fetch/geo';
import { getPhotoMap } from '@lupira/cal-api/fetch/photo';
import type { FuzzyDate } from '@lupira/cal-domain/fuzzyDate';
import {
  EMPTY_FEATURES,
  contactFeatures,
  currentFixFeatures,
  eventFeatures,
  photoFeatures,
  savedPlaceFeatures,
  trackFeatures,
  visitFeatures,
} from '@lupira/cal-domain/mapFeatures';
import { getDb } from '../data/db/expoDb';
import { mapContactAddresses, mapEventRowsBetween } from '../data/mirror';
import { useSyncStatus } from '../sync/syncStatus';
import { useCalendars } from './useContainers';
import { useCurrentFixes, useThinnedTrack, useVisits } from './useMovement';
import { usePlaceCoords } from './usePlaceLookup';

/** GeoJSON layers for the map. Mirror-backed reads key under ['occurrences'/'contacts'] so sync pulls
 *  invalidate them; network-backed ones override the mirror-tuned defaults (staleTime Infinity /
 *  retry false) — offline the map simply lacks those layers, never an error surface. */

/** A recording hole longer than this breaks the drawn track (tracker off, retention edge). */
const TRACK_MAX_GAP_S = 10 * 60;

export function useEventFeatures(fromDay: string, toDay: string, enabled: boolean): FeatureCollection {
  const rowsQ = useQuery({
    queryKey: ['occurrences', 'map', fromDay, toDay],
    enabled,
    queryFn: async () => mapEventRowsBetween(await getDb(), fromDay, toDay),
  });
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);
  const calendarsQ = useCalendars();
  const places = usePlaceCoords(useMemo(() => rows.map((r) => r.place_id), [rows]));

  return useMemo(() => {
    if (!enabled) return EMPTY_FEATURES;
    const colorByCalendar = new Map((calendarsQ.data ?? []).map((c) => [c.id, c.color ?? null]));
    return eventFeatures(
      rows.map((row) => ({
        itemId: row.source_id,
        title: row.title,
        start: row.start_utc,
        calendarId: row.calendar_id,
        color: (row.calendar_id ? colorByCalendar.get(row.calendar_id) : null) ?? null,
        placeId: row.place_id,
      })),
      places,
    ).features;
  }, [enabled, rows, places, calendarsQ.data]);
}

/** Geotagged photo pins in the viewport. Bbox-scoped and server-capped, so panning refetches rather
 *  than holding the whole library; thumbnails are presigned URLs valid for hours. */
export function usePhotoFeatures(bbox: string | null, enabled: boolean): FeatureCollection {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const q = useQuery({
    queryKey: ['map', 'photos', bbox],
    enabled: enabled && reachable && bbox !== null,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await getPhotoMap({ bbox: bbox! });
      if (r.status !== 200) throw new Error(`photos map ${r.status}`);
      return r.data;
    },
  });

  return useMemo(
    () => (enabled ? photoFeatures(q.data?.features ?? []) : EMPTY_FEATURES),
    [enabled, q.data],
  );
}

export type MovementFeatures = { visits: FeatureCollection; track: FeatureCollection; current: FeatureCollection };

const EMPTY_MOVEMENT: MovementFeatures = { visits: EMPTY_FEATURES, track: EMPTY_FEATURES, current: EMPTY_FEATURES };
/** Where you've been: dwell circles, an activity-coloured track, and the last fix each device reported. */
/** `live` polls the current fixes — only while the map is on screen. */
export function useMovementFeatures(fromIso: string, toIso: string, enabled: boolean, live: boolean): MovementFeatures {
  const visitsQ = useVisits(fromIso, toIso, enabled);
  const trackQ = useThinnedTrack(fromIso, toIso, enabled);
  const currentQ = useCurrentFixes(enabled, live);

  return useMemo(() => {
    if (!enabled) return EMPTY_MOVEMENT;
    return {
      visits: visitFeatures(visitsQ.data ?? []),
      track: trackFeatures(
        (trackQ.data ?? []).map((p) => ({ lat: p.lat, lon: p.lon, ts: p.ts, activity: p.activity ?? null })),
        TRACK_MAX_GAP_S,
      ),
      current: currentFixFeatures(currentQ.data ?? []),
    };
  }, [enabled, visitsQ.data, trackQ.data, currentQ.data]);
}

/** Contact pins from the local mirror — co-located contacts (a household) merge into one pin.
 *  Current addresses only; residency history is a web-only nicety not worth the phone screen. */
export function useContactFeatures(enabled: boolean): FeatureCollection {
  const rowsQ = useQuery({
    queryKey: ['contacts', 'map'],
    enabled,
    queryFn: async () => mapContactAddresses(await getDb()),
  });
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);
  const places = usePlaceCoords(useMemo(() => rows.map((r) => r.place_id), [rows]));

  return useMemo(() => {
    if (!enabled) return EMPTY_FEATURES;
    const parse = (raw: string | null): FuzzyDate | null => (raw ? (JSON.parse(raw) as FuzzyDate) : null);
    return contactFeatures(
      rows.map((row) => ({
        contactId: row.contact_id,
        displayName: row.display_name,
        placeId: row.place_id,
        addressType: row.address_type,
        movedIn: parse(row.moved_in),
        movedOut: parse(row.moved_out),
      })),
      places,
    ).features;
  }, [enabled, rows, places]);
}

/** Saved-place pins (favorites first is the API's order; gazetteer link or raw pin). */
export function useSavedPlaceFeatures(enabled: boolean): FeatureCollection {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const q = useQuery({
    queryKey: ['map', 'saved-places'],
    enabled: enabled && reachable,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await listSavedPlaces();
      if (r.status !== 200) throw new Error(`saved places ${r.status}`);
      return r.data;
    },
  });

  return useMemo(
    () => (enabled ? savedPlaceFeatures(q.data ?? []) : EMPTY_FEATURES),
    [enabled, q.data],
  );
}
