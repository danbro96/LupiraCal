import { useMemo } from 'react';
import { useGetParticipationSummary, useSearchItems } from '@lupira/cal-api/query/cal';
import { useSearchContacts } from '@lupira/cal-api/query/contact';
import { useListSavedPlaces, useSuggestPlaces } from '@lupira/cal-api/query/geo';
import { SuggestionType } from '@lupira/cal-api/models';
import { MIN_PLACE_QUERY, eventOrigin, pickPlaces } from '@lupira/cal-domain/placeCandidates';
import { addDays, parseYmd } from '@lupira/cal-domain/time';
import { useHotspots } from './useHotspots';
import { usePlaceCoords } from './usePlaceLookup';

/** The place picker's sources, fetched once it opens, ranked by `@lupira/cal-domain/placeCandidates`: saved
 *  places, hotspots, the typeahead, and contacts' addresses (by name, or because they're invited). The
 *  day's other events place the event; localities ride along unranked — they only aim the pin map. */
export function usePlaceCandidates({ query, opened, attendeeIds, day }: {
  query: string;
  opened: boolean;
  attendeeIds: readonly string[];
  day: string | null;
}) {
  const q = query.trim();
  const typing = q.length >= MIN_PLACE_QUERY;
  const suggest = useSuggestPlaces({ q, limit: 8 }, { query: { enabled: typing } });
  const { data: hotspots } = useHotspots(opened);
  const { data: saved } = useListSavedPlaces({ query: { enabled: opened } });
  const { data: contacts } = useSearchContacts({}, { query: { enabled: opened } });
  const { data: summary } = useGetParticipationSummary(undefined, { query: { enabled: opened } });
  const dayRange = day ? { from: parseYmd(day).toISOString(), to: addDays(parseYmd(day), 1).toISOString() } : undefined;
  const { data: dayEvents } = useSearchItems(dayRange, { query: { enabled: opened && !!dayRange } });

  const addresses = useMemo(() => (contacts ?? []).flatMap((c) => (c.addresses ?? []).map((a) => ({
    contactId: c.id,
    displayName: c.displayName,
    placeId: a.placeId,
    addressType: a.type ?? null,
    movedIn: a.movedIn ?? null,
    movedOut: a.movedOut ?? null,
  }))), [contacts]);
  // Same id set as the map's contact layer, so both share one lookup.
  const { places } = usePlaceCoords(useMemo(() => addresses.map((a) => a.placeId), [addresses]));
  const { places: dayPlaces } = usePlaceCoords(useMemo(() => (dayEvents ?? []).map((o) => o.placeId), [dayEvents]));

  return useMemo(() => {
    const picked = pickPlaces({
      query: typing ? q : '',
      now: new Date(),
      saved: saved ?? [],
      hotspots: hotspots ?? [],
      suggestions: (suggest.data ?? []).filter((s) => s.type === SuggestionType.Place),
      addresses,
      places,
      attendeeIds,
      contactScores: new Map((summary ?? []).map((e) => [e.contactId, e.score])),
      origin: eventOrigin(dayPlaces.values(), null),
    });
    const localities = typing ? (suggest.data ?? []).filter((s) => s.type === SuggestionType.Locality) : [];
    return { ...picked, localities, typing, loading: typing && suggest.isLoading };
  }, [typing, q, saved, hotspots, suggest.data, suggest.isLoading, addresses, places, attendeeIds, summary, dayPlaces]);
}
