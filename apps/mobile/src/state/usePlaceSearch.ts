import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHotspots } from '@lupira/cal-api/fetch/cal';
import { createPlace, createPlaceFromGeocode, forwardGeocode, listSavedPlaces, suggestPlaces } from '@lupira/cal-api/fetch/geo';
import { PlaceCategory, SuggestionType, type GeocodeResultDto } from '@lupira/cal-api/models';
import type { FuzzyDate } from '@lupira/cal-domain/fuzzyDate';
import { MIN_PLACE_QUERY, eventOrigin, pickPlaces } from '@lupira/cal-domain/placeCandidates';
import { GEOCODER_UNAVAILABLE, placeRequestFromHit } from '@lupira/cal-domain/places';
import { getDb } from '../data/db/expoDb';
import { mapContactAddresses, mapEventRowsBetween } from '../data/mirror';
import { lastKnownPosition } from '../sync/livePosition';
import { useSyncStatus } from '../sync/syncStatus';
import { useParticipationSummary } from './useParticipationSummary';
import { usePlaceCoords } from './usePlaceLookup';

/** What the event editor stores: a geo place id plus the label written next to it. */
export type PlaceOption = { placeId: string; label: string; context?: string | null };

const parseFuzzy = (raw: string | null): FuzzyDate | null => (raw ? (JSON.parse(raw) as FuzzyDate) : null);

/** Every place the picker can offer, as one list ranked by `@lupira/cal-domain/placeRank`: saved places, your
 *  hotspots, the server's typeahead and your contacts' addresses (matched by the contact's name, or because
 *  they're invited). Contacts come from the mirror; the rest needs a connection and fails open to less. */
export function usePlaceCandidates({ query, attendeeIds, day }: { query: string; attendeeIds: string[]; day: string | null }) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const q = query.trim();
  const typing = q.length >= MIN_PLACE_QUERY;

  const hotspots = useQuery({
    queryKey: ['map', 'hotspots'],
    enabled: reachable,
    staleTime: 600_000,
    retry: 1,
    queryFn: async () => {
      const r = await getHotspots();
      if (r.status !== 200) throw new Error(`hotspots ${r.status}`);
      return r.data;
    },
  });
  const saved = useQuery({
    queryKey: ['map', 'saved-places'],
    enabled: reachable,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await listSavedPlaces();
      if (r.status !== 200) throw new Error(`saved places ${r.status}`);
      return r.data;
    },
  });
  const suggested = useQuery({
    queryKey: ['places', 'suggest', q],
    enabled: reachable && typing,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await suggestPlaces({ q, limit: 8 });
      if (r.status !== 200) throw new Error(`place suggest ${r.status}`);
      // A locality is a search scope, not somewhere an event can be.
      return r.data.filter((s) => s.type === SuggestionType.Place);
    },
  });
  const addresses = useQuery({
    queryKey: ['contacts', 'map'],
    queryFn: async () => mapContactAddresses(await getDb()),
  });
  const dayEvents = useQuery({
    queryKey: ['items', 'places-on', day],
    enabled: !!day,
    queryFn: async () => mapEventRowsBetween(await getDb(), day!, day!),
  });
  const fix = useQuery({ queryKey: ['location', 'last-known'], staleTime: 300_000, retry: false, queryFn: lastKnownPosition });
  const { data: summary } = useParticipationSummary(true);

  const rows = useMemo(() => (addresses.data ?? []).map((r) => ({
    contactId: r.contact_id,
    displayName: r.display_name,
    placeId: r.place_id,
    addressType: r.address_type,
    movedIn: parseFuzzy(r.moved_in),
    movedOut: parseFuzzy(r.moved_out),
  })), [addresses.data]);
  // Same id set as the map's contact layer, so both share one lookup.
  const places = usePlaceCoords(useMemo(() => (addresses.data ?? []).map((r) => r.place_id), [addresses.data]));
  const dayPlaces = usePlaceCoords(useMemo(() => (dayEvents.data ?? []).map((r) => r.place_id), [dayEvents.data]));

  return useMemo(() => {
    const picked = pickPlaces({
      query: typing ? q : '',
      now: new Date(),
      saved: saved.data ?? [],
      hotspots: hotspots.data ?? [],
      suggestions: suggested.data ?? [],
      addresses: rows,
      places,
      attendeeIds,
      contactScores: new Map((summary ?? []).map((e) => [e.contactId, e.score])),
      origin: eventOrigin(dayPlaces.values(), fix.data ?? null),
    });
    return { ...picked, loading: typing && suggested.isFetching };
  }, [rows, places, dayPlaces, saved.data, hotspots.data, suggested.data, suggested.isFetching, fix.data, summary, attendeeIds, q, typing]);
}

/** Addresses the geocoder knows — none of them a place yet; picking one creates it. */
export function useGeocodeHits(query: string) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const q = query.trim();
  return useQuery({
    queryKey: ['places', 'geocode', q],
    enabled: reachable && q.length >= 2,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await forwardGeocode({ q, limit: 5 });
      if (r.status !== 200) throw new Error(`geocode ${r.status}`);
      return r.data;
    },
  });
}

/** A geocoder hit becomes a place: OSM-backed hits resolve server-side (deduped against existing places), the
 *  rest are created at their coordinates under the name that was typed. */
export async function createPlaceFromHit(hit: GeocodeResultDto, typedName: string): Promise<PlaceOption> {
  const req = placeRequestFromHit(hit, typedName, Object.values(PlaceCategory));
  if (req.kind === 'fromGeocode') {
    const r = await createPlaceFromGeocode(req.body);
    if (r.status !== 200 || !r.data.placeId) throw new Error(GEOCODER_UNAVAILABLE);
    return { placeId: r.data.placeId, label: r.data.name };
  }
  const r = await createPlace({ ...req.body, category: req.body.category as PlaceCategory | undefined });
  if (r.status !== 200) throw new Error(`create place ${r.status}`);
  return { placeId: r.data.id, label: r.data.name };
}
