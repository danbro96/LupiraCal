import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getForwardGeocodeQueryOptions } from '@lupira/cal-api/query/geo';
import { GeocodeIntent, type GeocodeResultDto } from '@lupira/cal-api/models';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import { pinStart } from '@danbro96/lupira-domain-places/pin';
import { textMatch } from '@danbro96/lupira-domain-places/placeRank';
import { ADDRESS_SEARCH_LIMIT, PLACE_SEARCH_DEBOUNCE_MS, pickPlaces } from '@danbro96/lupira-domain-places/placeCandidates';
import { pinNameRequired, type PlaceContext } from '@lupira/cal-domain/placeContext';
import { omniboxSections, type OmniboxAddressHit } from '@lupira/cal-domain/placeOmnibox';
import {
  initialPlaceSearch,
  placeSearchTransition,
  type PlaceSearchCommand,
  type PlaceSearchEvent,
  type PlaceSearchState,
} from '@lupira/cal-domain/placeSearchMachine';
import type { PlaceSelection, PlaceSelectionVia } from '@lupira/cal-domain/placeSelection';
import { usePlacePredictions } from './usePlacePredictions';
import { usePinPlace, useResolveGeocodeHit, type GeocodeHit } from './usePlaces';

const message = (e: unknown) => (e instanceof Error ? e.message : undefined);

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** The place search behind "More…": predictions and known places before typing; your places, typeahead addresses
 *  and a map pin while typing. Every way out ends in `onResolved` with a stored place. */
export function usePlaceOmnibox(ctx: PlaceContext, { initialText = '', onResolved }: {
  initialText?: string;
  onResolved: (selection: PlaceSelection) => void;
}) {
  const known = usePlacePredictions(ctx);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const queryClient = useQueryClient();
  const resolveHit = useResolveGeocodeHit();
  const pinPlace = usePinPlace();
  const [state, setState] = useState<PlaceSearchState>(() => initialPlaceSearch({ text: initialText, pinNameRequired: pinNameRequired(ctx) }));
  const stateRef = useRef(state);
  const hits = useRef<GeocodeResultDto[]>([]);
  const picked = useRef<GeocodeHit | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const near: GeoPoint | null = known.origin;

  const dispatch = (event: PlaceSearchEvent) => {
    const { state: next, commands } = placeSearchTransition(stateRef.current, event);
    stateRef.current = next;
    setState(next);
    for (const cmd of commands) run(cmd);
  };

  const run = (cmd: PlaceSearchCommand) => {
    switch (cmd.kind) {
      case 'geocode':
        queryClient
          .fetchQuery(getForwardGeocodeQueryOptions({
            q: cmd.q, intent: GeocodeIntent.Typeahead, nearLat: near?.lat, nearLon: near?.lon, limit: ADDRESS_SEARCH_LIMIT,
          }))
          .then((found) => {
            hits.current = found;
            dispatch({ type: 'GEOCODE_OK', token: cmd.token, hits: found });
          })
          .catch((e: unknown) => dispatch({ type: 'GEOCODE_ERROR', token: cmd.token, message: message(e) }));
        return;
      case 'resolveHit':
        if (!picked.current) return;
        resolveHit
          .mutateAsync({ hit: picked.current, name: cmd.request.name })
          .then((s) => dispatch({ type: 'RESOLVE_OK', token: cmd.token, placeId: s.placeId, label: s.label }))
          .catch((e: unknown) => dispatch({ type: 'RESOLVE_ERROR', token: cmd.token, message: message(e) }));
        return;
      case 'pinPlace':
        pinPlace
          .mutateAsync({ lat: cmd.request.lat, lon: cmd.request.lon, name: cmd.request.name })
          .then((s) => dispatch({ type: 'CREATE_OK', token: cmd.token, placeId: s.placeId, label: s.label }))
          .catch((e: unknown) => dispatch({ type: 'CREATE_ERROR', token: cmd.token, message: message(e) }));
        return;
      case 'resolved':
        onResolved(cmd.selection);
        return;
    }
  };

  const scheduleSearch = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dispatch({ type: 'SEARCH' }), PLACE_SEARCH_DEBOUNCE_MS);
  };
  const searchSeededText = useEffectEvent(() => {
    if (stateRef.current.phase.kind === 'typing') scheduleSearch();
  });
  useEffect(() => {
    searchSeededText();
    return () => clearTimeout(timer.current);
  }, []);

  const { context, sources, origin, rows, places, saved, hotspots, predictions, nameOf } = known;
  const query = state.text.trim();
  // pickPlaces trusts suggestions as server matches, so local usage places are matched here first.
  const usagePlaces = sources.usage.flatMap((u) => {
    const p = places.get(u.placeId);
    const name = p?.name ?? u.label;
    return name && textMatch({ placeId: u.placeId, label: name }, query) > 0
      ? [{ id: u.placeId, name, latitude: p?.latitude, longitude: p?.longitude }]
      : [];
  });
  const ranked = pickPlaces({
    query,
    now: new Date(),
    saved,
    hotspots,
    suggestions: usagePlaces,
    addresses: rows,
    places,
    attendeeIds: context.kind === 'event' ? context.attendeeIds : [],
    origin,
  }).places;
  const knownPoints = [...places].flatMap(([placeId, p]) =>
    p.latitude != null && p.longitude != null ? [{ placeId, label: p.name, lat: p.latitude, lon: p.longitude }] : []);
  const sections = omniboxSections({ query: state.text, online, context, predictions, ranked, addressHits: state.hits, knownPoints });

  return {
    state,
    sections,
    nameOf,
    busy: resolveHit.isPending || pinPlace.isPending || (state.phase.kind === 'typing' && state.phase.geocodeToken !== null),
    type: (text: string) => {
      dispatch({ type: 'TYPE', text });
      if (stateRef.current.phase.kind === 'typing') scheduleSearch();
      else clearTimeout(timer.current);
    },
    pickPlace: (placeId: string, label: string, via: Extract<PlaceSelectionVia, 'prediction' | 'search' | 'existing'>) =>
      dispatch({ type: 'PICK_PLACE', placeId, label, via }),
    pickHit: (hit: OmniboxAddressHit) => {
      picked.current = hits.current.find((h) => h === hit) ?? hit;
      dispatch({ type: 'PICK_HIT', hit });
    },
    openPin: () => dispatch({ type: 'OPEN_PIN', start: pinStart({ origin, hits: stateRef.current.hits }) }),
    confirmPin: (point: GeoPoint, name: string | null) => dispatch({ type: 'PIN_CONFIRM', lat: point.lat, lon: point.lon, name }),
    cancelPin: () => dispatch({ type: 'PIN_CANCEL' }),
  };
}
