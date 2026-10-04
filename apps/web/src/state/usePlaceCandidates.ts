import { useMemo } from 'react';
import { useGetParticipationSummary, useSearchItems } from '@lupira/cal-api/query/cal';
import { useListSavedPlaces, useSuggestPlaces } from '@lupira/cal-api/query/geo';
import { SuggestionType } from '@lupira/cal-api/models';
import { MIN_PLACE_QUERY, PLACE_SUGGEST_LIMIT, eventOrigin, pickPlaces } from '@danbro96/lupira-domain-places/placeCandidates';
import { dayEndIso, dayStartIso } from '@danbro96/lupira-domain-core/time';
import { useHotspots } from './useHotspots';
import { usePlaceCoords } from './usePlaceLookup';
import { useResidencyRows } from './useResidencies';

/** The place picker's sources, fetched once it opens, ranked by `@danbro96/lupira-domain-places/placeCandidates`:
 *  saved places, hotspots, the typeahead, and contacts' addresses (by name, or because they're invited). The
 *  day's other events place the event; localities ride along unranked — they only aim the pin map. */
export function usePlaceCandidates({ query, opened, attendeeIds, day }: {
  query: string;
  opened: boolean;
  attendeeIds: readonly string[];
  day: string | null;
}) {
  const q = query.trim();
  const typing = q.length >= MIN_PLACE_QUERY;
  const suggest = useSuggestPlaces({ q, limit: PLACE_SUGGEST_LIMIT }, { query: { enabled: typing } });
  const { data: hotspots } = useHotspots(opened);
  const { data: saved } = useListSavedPlaces({ query: { enabled: opened } });
  const { rows: addresses } = useResidencyRows(opened);
  const { data: summary } = useGetParticipationSummary(undefined, { query: { enabled: opened } });
  const dayRange = day ? { from: dayStartIso(day), to: dayEndIso(day) } : undefined;
  const { data: dayEvents } = useSearchItems(dayRange, { query: { enabled: opened && !!dayRange } });

  // Same id set as the map's contact layer, so both share one lookup.
  const { places } = usePlaceCoords(addresses.map((a) => a.placeId));
  const { places: dayPlaces } = usePlaceCoords((dayEvents ?? []).map((o) => o.placeId));

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
