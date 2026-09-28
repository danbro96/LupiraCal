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
} from '@lupira/cal-domain/mapFeatures';
import { useSearchContacts } from '@lupira/cal-api/query/contact';
import { useListSavedPlaces } from '@lupira/cal-api/query/geo';
import { useGetPhotoMap } from '@lupira/cal-api/query/photo';
import type { LocationTripDto } from '@lupira/cal-api/models';
import { useContainers } from './useContainers';
import { useHotspots } from './useHotspots';
import { useCurrentFixes, useThinnedTrack, useTrips, useVisits } from './useMovement';
import { usePlaceCoords } from './usePlaceLookup';
import { useRangeOccurrences } from './useRangeOccurrences';

/** A recording hole longer than this breaks the drawn track (tracker off, retention edge). */
const TRACK_MAX_GAP_S = 10 * 60;

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

  const { places, isLoading: hydrating } = usePlaceCoords(
    useMemo(() => occurrences.map(({ occurrence }) => occurrence.placeId), [occurrences]),
  );

  return useMemo(() => {
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
  }, [occurrences, places, isLoading, hydrating, enabled]);
}

/** Contact pins: every address placeId hydrated; co-located contacts (shared household place) merge into one pin.
 * `features` = current addresses; `former` = residency history (movedOut set), labeled with the period. */
export function useContactFeatures(enabled: boolean): {
  features: FeatureCollection;
  former: FeatureCollection;
  isLoading: boolean;
} {
  const contactsQ = useSearchContacts({}, { query: { enabled } });
  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data]);

  // One hydration serves both current and former pins.
  const { places, isLoading: hydrating } = usePlaceCoords(
    useMemo(() => contacts.flatMap((c) => c.addresses.map((a) => a.placeId)), [contacts]),
  );

  return useMemo(() => {
    const { features, former } = contactFeatures(
      contacts.flatMap((contact) =>
        contact.addresses.map((address) => ({
          contactId: contact.id,
          displayName: contact.displayName,
          placeId: address.placeId,
          addressType: String(address.type),
          movedIn: address.movedIn,
          movedOut: address.movedOut,
        }))),
      places,
    );
    return { features, former, isLoading: enabled && (contactsQ.isLoading || hydrating) };
  }, [contacts, places, contactsQ.isLoading, hydrating, enabled]);
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
  const trackQ = useThinnedTrack(from, to, enabled);
  const currentQ = useCurrentFixes(enabled);

  return useMemo(() => ({
    visits: visitFeatures(visitsQ.data ?? []),
    track: trackFeatures(
      (trackQ.data ?? []).map((p) => ({ lat: p.lat, lon: p.lon, ts: p.ts, activity: p.activity ?? null })),
      TRACK_MAX_GAP_S,
    ),
    current: currentFixFeatures(currentQ.data ?? []),
    trips: tripsQ.data ?? [],
    isLoading: enabled && (visitsQ.isLoading || trackQ.isLoading || tripsQ.isLoading),
  }), [visitsQ.data, visitsQ.isLoading, tripsQ.data, tripsQ.isLoading, trackQ.data, trackQ.isLoading, currentQ.data, enabled]);
}

/** Saved-place pins (favorites first is the API's order; either a gazetteer link or a raw pin). */
export function useSavedPlaceFeatures(enabled: boolean): { features: FeatureCollection; isLoading: boolean } {
  const savedQ = useListSavedPlaces({ query: { enabled } });

  return useMemo(() => ({
    features: savedPlaceFeatures(savedQ.data ?? []),
    isLoading: enabled && savedQ.isLoading,
  }), [savedQ.data, savedQ.isLoading, enabled]);
}

/** Geotagged photo/video pins in the current viewport. Bbox-scoped (the endpoint caps its result set),
 *  so panning refetches instead of holding the whole library; thumbnail URLs are presigned. */
export function usePhotoFeatures(bbox: string | null, enabled: boolean): { features: FeatureCollection; isLoading: boolean } {
  const photosQ = useGetPhotoMap({ bbox: bbox ?? '' }, { query: { enabled: enabled && bbox !== null } });

  return useMemo(() => ({
    features: photoFeatures(photosQ.data?.features ?? []),
    isLoading: enabled && photosQ.isLoading,
  }), [photosQ.data, photosQ.isLoading, enabled]);
}

/** Where events and photos concentrate, all-time. The server clusters and ranks, so one fetch serves every viewport. */
export function useHotspotFeatures(enabled: boolean): { features: FeatureCollection; isLoading: boolean } {
  const hotspotsQ = useHotspots(enabled);

  return useMemo(() => ({
    features: hotspotFeatures(hotspotsQ.data ?? []),
    isLoading: enabled && hotspotsQ.isLoading,
  }), [hotspotsQ.data, hotspotsQ.isLoading, enabled]);
}
