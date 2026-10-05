import { useMemo } from 'react';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { useQuery } from '@tanstack/react-query';
import { getHotspots } from '@lupira/cal-api/fetch/cal';
import { createPlace, createPlaceFromGeocode, forwardGeocode, listSavedPlaces, suggestPlaces } from '@lupira/cal-api/fetch/geo';
import { PlaceCategory, SuggestionType, type GeocodeResultDto } from '@lupira/cal-api/models';
import {
  ADDRESS_SEARCH_LIMIT, MIN_PLACE_QUERY, PLACE_SUGGEST_LIMIT, eventOrigin, pickPlaces,
} from '@danbro96/lupira-domain-places/placeCandidates';
import { GEOCODER_UNAVAILABLE, placeRequestFromHit } from '@danbro96/lupira-domain-places/places';
import { placedEventsBetween } from '../data/queries/places';
import { Aggregate } from '../domain/aggregates';
import { readyDb } from '../sync/engine';
import { useParticipationSummary } from './useParticipationSummary';
import { usePlaceCoords } from './usePlaceLookup';
import { useResidencyRows } from './useResidencies';

/** What the event editor stores: a geo place id plus the label written next to it. */
export type PlaceOption = { placeId: string; label: string; context?: string | null };


/** Every place the picker can offer, as one list ranked by `@danbro96/lupira-domain-places/placeRank`: saved
 *  places, your hotspots, the server's typeahead and your contacts' addresses (matched by the contact's name,
 *  or because they're invited). Contacts come from the mirror; the rest needs a connection and fails open to less. */
export function usePlaceCandidates({ query, attendeeIds, day }: { query: string; attendeeIds: string[]; day: string | null }) {
  const q = query.trim();
  const typing = q.length >= MIN_PLACE_QUERY;

  const hotspots = useQuery(onlineQuery(['map', 'hotspots'], () => getHotspots()));
  const saved = useQuery(onlineQuery(['map', 'saved-places'], () => listSavedPlaces()));
  const suggested = useQuery({
    // A locality is a search scope, not somewhere an event can be.
    ...onlineQuery(['places', 'suggest', q], async () =>
      (await suggestPlaces({ q, limit: PLACE_SUGGEST_LIMIT })).filter((s) => s.type === SuggestionType.Place)),
    enabled: typing,
  });
  const rows = useResidencyRows();
  const dayEvents = useQuery({
    ...mirrorQuery([Aggregate.item, 'places-on', day], async () => placedEventsBetween(await readyDb(), day!, day!)),
    enabled: !!day,
  });
  const { data: summary } = useParticipationSummary(true);

  const places = usePlaceCoords(rows.map((r) => r.placeId));
  const dayPlaces = usePlaceCoords((dayEvents.data ?? []).map((r) => r.place_id));

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
      origin: eventOrigin(dayPlaces.values(), null),
    });
    return { ...picked, loading: typing && suggested.isFetching };
  }, [rows, places, dayPlaces, saved.data, hotspots.data, suggested.data, suggested.isFetching, summary, attendeeIds, q, typing]);
}

/** Addresses the geocoder knows — none of them a place yet; picking one creates it. */
export function useGeocodeHits(query: string) {
  const q = query.trim();
  return useQuery({
    ...onlineQuery(['places', 'geocode', q], () => forwardGeocode({ q, limit: ADDRESS_SEARCH_LIMIT })),
    enabled: q.length >= MIN_PLACE_QUERY,
  });
}

/** A geocoder hit becomes a place: OSM-backed hits resolve server-side (deduped against existing places), the
 *  rest are created at their coordinates under the name that was typed. */
export async function createPlaceFromHit(hit: GeocodeResultDto, typedName: string): Promise<PlaceOption> {
  const req = placeRequestFromHit(hit, typedName, Object.values(PlaceCategory));
  if (req.kind === 'fromGeocode') {
    const resolved = await createPlaceFromGeocode(req.body);
    if (!resolved.placeId) throw new Error(GEOCODER_UNAVAILABLE);
    return { placeId: resolved.placeId, label: resolved.name };
  }
  const place = await createPlace({ ...req.body, category: req.body.category as PlaceCategory | undefined });
  return { placeId: place.id, label: place.name };
}
