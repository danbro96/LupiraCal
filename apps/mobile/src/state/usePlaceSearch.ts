import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHotspots } from '@lupira/cal-api/fetch/cal';
import { createPlace, createPlaceFromGeocode, forwardGeocode, listSavedPlaces, suggestPlaces } from '@lupira/cal-api/fetch/geo';
import { SuggestionType, type GeocodeResultDto } from '@lupira/cal-api/models';
import type { FuzzyDate } from '@lupira/cal-domain/fuzzyDate';
import { haversineM } from '@lupira/cal-domain/geo';
import { hotspotStats } from '@lupira/cal-domain/mapFeatures';
import { rankPlaces, type PlaceCandidate } from '@lupira/cal-domain/placeRank';
import { otherResidentsLine, residentsByPlace, residentsLine, withResidency } from '@lupira/cal-domain/residents';
import { matchesTerms, searchTerms } from '@lupira/cal-domain/textSearch';
import { getDb } from '../data/db/expoDb';
import { mapContactAddresses, mapEventRowsBetween } from '../data/mirror';
import { lastKnownPosition } from '../sync/livePosition';
import { useSyncStatus } from '../sync/syncStatus';
import { useParticipationSummary } from './useParticipationSummary';
import { usePlaceCoords } from './usePlaceLookup';

/** What the event editor stores: a geo place id plus the label written next to it. */
export type PlaceOption = { placeId: string; label: string; context?: string | null };

const CANDIDATE_HOTSPOTS = 30;
const SHOWN_LIMIT = 15;
/** A geocoder hit this close to a resident's place is taken to be that address. */
const RESIDENT_RADIUS_M = 30;

export type PickerPlace = PlaceCandidate & {
  /** "Anna lives here". */
  residentsLine: string | null;
  /** "Anna lived here 2010–2015" — muted, and only where nobody lives now. */
  otherLine: string | null;
};

const parseFuzzy = (raw: string | null): FuzzyDate | null => (raw ? (JSON.parse(raw) as FuzzyDate) : null);

/** Every place the picker can offer, as one list ranked by `@lupira/cal-domain/placeRank`: saved places, your
 *  hotspots, the server's typeahead and your contacts' addresses (matched by the contact's name, or because
 *  they're invited). Contacts come from the mirror; the rest needs a connection and fails open to less. */
export function usePlaceCandidates({ query, attendeeIds, day }: { query: string; attendeeIds: string[]; day: string | null }) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const q = query.trim();
  const typing = q.length >= 2;

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
    const now = new Date();
    const residents = residentsByPlace(rows, now);
    const residentsOf = (placeId: string) => {
      const r = residents.get(placeId);
      return r ? [...r.active, ...r.other].map((x) => ({ contactId: x.contactId, status: x.status })) : undefined;
    };
    const pointOf = (lat?: number | null, lon?: number | null) => (lat != null && lon != null ? { lat, lon } : null);
    const attendees = new Set(attendeeIds);
    const terms = searchTerms(q);

    const candidates: PlaceCandidate[] = [
      ...(saved.data ?? []).flatMap((p) => (p.placeId
        ? [{ placeId: p.placeId, label: p.label, saved: true, point: pointOf(p.latitude, p.longitude) }]
        : [])),
      ...(hotspots.data ?? []).slice(0, CANDIDATE_HOTSPOTS).flatMap((h) => (h.placeId && h.label
        ? [{
            placeId: h.placeId, label: h.label, context: hotspotStats(h),
            hotspot: { activeDays: h.activeDays, lastDay: h.lastDay }, point: pointOf(h.latitude, h.longitude),
          }]
        : [])),
      ...(typing ? suggested.data ?? [] : []).map((s, i) => ({
        placeId: s.id, label: s.name, context: s.context, suggestRank: i, point: pointOf(s.latitude, s.longitude),
      })),
      ...rows.flatMap((r) => {
        const named = typing && matchesTerms(terms, r.displayName);
        const invited = !typing && attendees.has(r.contactId);
        if (!named && !invited) return [];
        const place = places.get(r.placeId);
        const status = withResidency(r, now).status;
        if (invited && status !== 'active') return [];
        return [{
          placeId: r.placeId,
          label: place?.name ?? `${r.displayName}'s ${(r.addressType ?? 'address').toLowerCase()}`,
          context: place?.formattedAddress,
          viaContact: named ? { contactId: r.contactId, status } : undefined,
          point: pointOf(place?.latitude, place?.longitude),
        }];
      }),
    ].map((c) => ({ ...c, residents: residentsOf(c.placeId) }));

    const located = [...dayPlaces.values()].filter((p) => p.latitude != null && p.longitude != null);
    const origin = located.length > 0
      ? { lat: located.reduce((n, p) => n + p.latitude!, 0) / located.length, lon: located.reduce((n, p) => n + p.longitude!, 0) / located.length }
      : fix.data ?? null;

    const ranked = rankPlaces(candidates, {
      query: q,
      now,
      attendeeIds: attendees,
      contactScores: new Map((summary ?? []).map((e) => [e.contactId, e.score])),
      origin,
    }).slice(0, SHOWN_LIMIT);

    const residentsNear = (point: { lat: number; lon: number }) => {
      for (const [placeId, r] of residents) {
        const p = places.get(placeId);
        if (r.active.length > 0 && p?.latitude != null && p.longitude != null
          && haversineM(point, { lat: p.latitude, lon: p.longitude }) <= RESIDENT_RADIUS_M) return residentsLine(r);
      }
      return null;
    };

    return {
      places: ranked.map((c): PickerPlace => ({
        ...c,
        residentsLine: residentsLine(residents.get(c.placeId)),
        otherLine: otherResidentsLine(residents.get(c.placeId)),
      })),
      residentsNear,
      loading: typing && suggested.isFetching,
    };
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
  if (hit.osmType && hit.osmId != null) {
    const r = await createPlaceFromGeocode({ query: typedName, osmType: hit.osmType, osmId: hit.osmId });
    if (r.status !== 200 || !r.data.placeId) throw new Error('The geocoder is unavailable — no place was created.');
    return { placeId: r.data.placeId, label: r.data.name };
  }
  const r = await createPlace({
    name: typedName || hit.displayName,
    latitude: hit.latitude,
    longitude: hit.longitude,
    formattedAddress: hit.displayName,
    category: hit.category,
  });
  if (r.status !== 200) throw new Error(`create place ${r.status}`);
  return { placeId: r.data.id, label: r.data.name };
}
