import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import {
  contactFeatures,
  currentFixFeatures,
  eventFeatures,
  hotspotFeatures,
  photoFeatures,
  savedPlaceFeatures,
  trackFeatures,
  visitFeatures,
  TRACK_MAX_GAP_S,
} from '@lupira/cal-domain/mapFeatures';
import type { MapViewport } from '@danbro96/lupira-domain-places/geo';
import { useListSavedPlaces } from '@lupira/cal-api/query/geo';
import { useGetPhotoMap } from '@lupira/cal-api/query/photo';
import type { LocationTripDto } from '@lupira/cal-api/models';
import { useGetHotspots } from '@lupira/cal-api/query/cal';
import { trackBucketSeconds } from '@lupira/cal-domain/mapWindow';
import { useContainers } from './useContainers';
import { useCurrentFixes, useThinnedTrack, useTrips, useVisits } from './useMovement';
import { useMyContactId } from './useMe';
import { usePlaceCoords } from './usePlaceLookup';
import { useRangeOccurrences } from './useRangeOccurrences';
import { useParentsHomes, useResidencyRows } from './useResidencies';

const HOTSPOT_STALE_MS = 10 * 60_000;

export interface EventFeaturesResult {
  features: FeatureCollection;
  /** Occurrences in range whose item has only a free-text label (CalDAV imports) — unmappable. */
  unmappableCount: number;
  isLoading: boolean;
}

/** Event pins: occurrences in [from, to] across all readable calendars, hydrated placeId → coords. */
export function useEventFeatures(from: string, to: string, enabled: boolean): EventFeaturesResult {
  const { calendars } = useContainers();
  const { byCalendar, isLoading } = useRangeOccurrences(enabled ? calendars : [], from, to);

  const occurrences = useMemo(
    () => byCalendar.flatMap(({ calendar, occurrences }) =>
      occurrences.map((o) => ({ occurrence: o, calendarId: calendar.id, color: calendar.color ?? null }))),
    [byCalendar],
  );

  const { places, isLoading: hydrating } = usePlaceCoords(occurrences.map(({ occurrence }) => occurrence.placeId));

  const { features, unmappableCount } = eventFeatures(
    occurrences.map(({ occurrence, calendarId, color }) => ({
      itemId: occurrence.id,
      title: occurrence.title,
      start: occurrence.start,
      calendarId,
      color,
      placeId: occurrence.placeId,
      hasLocationLabel: Boolean(occurrence.locationLabel),
    })),
    places,
  );
  return { features, unmappableCount, isLoading: enabled && (isLoading || hydrating) };
}

/** Contact pins: every residency's place hydrated; co-located contacts (shared household place) merge into one pin, and
 * your parents' home is named as such. `features` = current residencies; `former` = residency history, labeled with
 * the period. */
export function useContactFeatures(enabled: boolean): {
  features: FeatureCollection;
  former: FeatureCollection;
  isLoading: boolean;
} {
  const { rows, isLoading } = useResidencyRows(enabled);
  const parents = useParentsHomes(useMyContactId(), rows);

  // One hydration serves both current and former pins.
  const { places, isLoading: hydrating } = usePlaceCoords(rows.map((r) => r.placeId));

  const { features, former } = contactFeatures(rows, places, new Map(parents.map((p) => [p.placeId, p.label])));
  return { features, former, isLoading: enabled && (isLoading || hydrating) };
}

export interface MovementFeaturesResult {
  visits: FeatureCollection;
  track: FeatureCollection;
  current: FeatureCollection;
  trips: LocationTripDto[];
  isLoading: boolean;
}

/** Movement layer: visit dwell-circles, activity-segmented track lines, and the live position dot. */
export function useMovementFeatures(from: string, to: string, enabled: boolean): MovementFeaturesResult {
  const visitsQ = useVisits(from, to, enabled);
  const tripsQ = useTrips(from, to, enabled);
  const trackQ = useThinnedTrack(from, to, enabled, trackBucketSeconds(new Date(from), new Date(to)));
  const currentQ = useCurrentFixes(enabled);

  return {
    visits: visitFeatures(visitsQ.data ?? []),
    track: trackFeatures(
      (trackQ.data ?? []).map((p) => ({ lat: p.lat, lon: p.lon, ts: p.ts, activity: p.activity ?? null })),
      TRACK_MAX_GAP_S,
    ),
    current: currentFixFeatures(currentQ.data ?? []),
    trips: tripsQ.data ?? [],
    isLoading: enabled && (visitsQ.isLoading || trackQ.isLoading || tripsQ.isLoading),
  };
}

/** Saved-place pins (favorites first is the API's order; either a gazetteer link or a raw pin). */
export function useSavedPlaceFeatures(enabled: boolean): { features: FeatureCollection; isLoading: boolean } {
  const savedQ = useListSavedPlaces({ query: { enabled } });

  return {
    features: savedPlaceFeatures(savedQ.data ?? []),
    isLoading: enabled && savedQ.isLoading,
  };
}

/** Geotagged photos taken in [from, to) in the current viewport, clustered by the server for its zoom, so
 *  panning refetches instead of holding the whole library; thumbnail URLs are presigned. */
export function usePhotoFeatures(viewport: MapViewport | null, from: string, to: string, enabled: boolean): { features: FeatureCollection; isLoading: boolean } {
  const photosQ = useGetPhotoMap(
    { ...(viewport ?? { bbox: '' }), from, to },
    { query: { enabled: enabled && viewport !== null } },
  );

  return {
    features: photoFeatures(photosQ.data?.features ?? []),
    isLoading: enabled && photosQ.isLoading,
  };
}

/** Where events and photos concentrated in [from, to). The server clusters and ranks, so one fetch serves
 *  every viewport. Its own cache entry: the place picker keeps the all-time list. */
export function useHotspotFeatures(from: string, to: string, enabled: boolean): { features: FeatureCollection; isLoading: boolean } {
  const hotspotsQ = useGetHotspots({ from, to }, { query: { enabled, staleTime: HOTSPOT_STALE_MS } });

  return {
    features: hotspotFeatures(hotspotsQ.data ?? []),
    isLoading: enabled && hotspotsQ.isLoading,
  };
}
