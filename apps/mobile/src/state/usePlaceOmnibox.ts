import { useEffect, useEffectEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { suggestPlaces } from '@lupira/cal-api/fetch/geo';
import { SuggestionType } from '@lupira/cal-api/models';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import {
  MIN_PLACE_QUERY, PLACE_SEARCH_DEBOUNCE_MS, PLACE_SUGGEST_LIMIT, pickPlaces,
} from '@danbro96/lupira-domain-places/placeCandidates';
import { pinNameRequired, type PlaceContext } from '@lupira/cal-domain/placeContext';
import { omniboxSections } from '@lupira/cal-domain/placeOmnibox';
import type { PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { useParticipationSummary } from './useParticipationSummary';
import { usePlaceCoords } from './usePlaceLookup';
import { useHotspots, usePlacePredictions, useSavedPlaces } from './usePlacePredictions';
import { usePlaceSearchMachine } from './usePlaceSearchMachine';
import { useResidencyRows } from './useResidencies';

/** The place picker's model: the search machine, typing settled into a typeahead (online only), and the sections
 *  to show — predictions, homes, saved and frequent places while browsing; your places, addresses and the pin
 *  while searching. */
export function usePlaceOmnibox(ctx: PlaceContext, { seed, onResolved }: { seed?: string; onResolved: (selection: PlaceSelection) => void }) {
  const online = useOnline();
  const origin = ctx.kind === 'event' ? ctx.origin : ctx.kind === 'free' ? ctx.near : undefined;
  const search = usePlaceSearchMachine({ pinNameRequired: pinNameRequired(ctx), seed, near: origin, onResolved });
  const text = search.state.text.trim();
  const [query, setQuery] = useState(text);

  const settle = useEffectEvent(() => {
    setQuery(text);
    if (online && text.length >= MIN_PLACE_QUERY) search.dispatch({ type: 'SEARCH' });
  });
  useEffect(() => {
    const t = setTimeout(settle, PLACE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text, online]);

  const typing = query.length >= MIN_PLACE_QUERY;
  const suggested = useQuery({
    ...onlineQuery(['places', 'suggest', query], async () =>
      (await suggestPlaces({ q: query, limit: PLACE_SUGGEST_LIMIT })).filter((s) => s.type === SuggestionType.Place)),
    enabled: typing,
  });
  const predictions = usePlacePredictions(ctx);
  const rows = useResidencyRows();
  const saved = useSavedPlaces();
  const hotspots = useHotspots();
  const places = usePlaceCoords(rows.map((r) => r.placeId));
  const { data: summary } = useParticipationSummary(ctx.kind === 'event');

  const { places: ranked } = pickPlaces({
    query: typing ? query : '',
    now: new Date(),
    saved,
    hotspots,
    suggestions: suggested.data ?? [],
    addresses: rows,
    places,
    attendeeIds: ctx.kind === 'event' ? ctx.attendeeIds : [],
    contactScores: new Map((summary ?? []).map((e) => [e.contactId, e.score])),
    origin,
  });
  const knownPoints = ranked.flatMap((c) => (c.point ? [{ placeId: c.placeId, label: c.label, ...c.point }] : []));
  const sections = omniboxSections({
    query: search.state.text, online, context: ctx, predictions, ranked, addressHits: search.state.hits, knownPoints,
  });

  return { ...search, sections, online, ranked, searching: typing && suggested.isFetching };
}
