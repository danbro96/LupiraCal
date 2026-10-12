import { useEffect, useRef, useState } from 'react';
import { forwardGeocode } from '@lupira/cal-api/fetch/geo';
import { GeocodeIntent } from '@lupira/cal-api/models';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import type { PinStart } from '@danbro96/lupira-domain-places/pin';
import { ADDRESS_SEARCH_LIMIT } from '@danbro96/lupira-domain-places/placeCandidates';
import { GEOCODER_UNAVAILABLE } from '@danbro96/lupira-domain-places/places';
import type { OmniboxAddressHit } from '@lupira/cal-domain/placeOmnibox';
import {
  initialPlaceSearch, placeSearchTransition, type PlaceSearchCommand, type PlaceSearchEvent, type PlaceSearchState,
} from '@lupira/cal-domain/placeSearchMachine';
import type { PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { resolvePlaceRequest } from './placeCommands';

/** Runs `@lupira/cal-domain/placeSearchMachine`: events in, its commands executed against geo-api, their answers fed
 *  back under the token they were issued with. `pin` starts it already pinning. */
export function usePlaceSearchMachine({ pinNameRequired, seed = '', pin, near, onResolved }: {
  pinNameRequired: boolean;
  seed?: string;
  pin?: PinStart;
  near?: GeoPoint | null;
  onResolved: (selection: PlaceSelection) => void;
}) {
  const [state, setState] = useState(() => {
    const initial = initialPlaceSearch({ text: seed, pinNameRequired });
    return pin ? placeSearchTransition(initial, { type: 'OPEN_PIN', start: pin }).state : initial;
  });
  const current = useRef<PlaceSearchState>(state);
  const pickedHit = useRef<OmniboxAddressHit | null>(null);
  const resolvedTo = useRef(onResolved);
  useEffect(() => {
    resolvedTo.current = onResolved;
  });

  const dispatch = (event: PlaceSearchEvent) => {
    const t = placeSearchTransition(current.current, event);
    current.current = t.state;
    setState(t.state);
    for (const command of t.commands) void run(command);
  };

  const run = async (command: PlaceSearchCommand) => {
    switch (command.kind) {
      case 'geocode':
        try {
          dispatch({ type: 'GEOCODE_OK', token: command.token, hits: await typeaheadHits(command.q, near) });
        } catch {
          dispatch({ type: 'GEOCODE_ERROR', token: command.token });
        }
        return;
      case 'resolveHit':
        try {
          dispatch({ type: 'RESOLVE_OK', token: command.token, ...await resolvePlaceRequest(command.request, pickedHit.current) });
        } catch (e) {
          dispatch({ type: 'RESOLVE_ERROR', token: command.token, message: unavailable(e) });
        }
        return;
      case 'pinPlace':
        try {
          dispatch({ type: 'CREATE_OK', token: command.token, ...await resolvePlaceRequest(command.request) });
        } catch (e) {
          dispatch({ type: 'CREATE_ERROR', token: command.token, message: unavailable(e) });
        }
        return;
      case 'resolved':
        resolvedTo.current(command.selection);
    }
  };

  // The hit is the geocoder's whole answer, so its address parts ride along to the resolve.
  const pickHit = (hit: OmniboxAddressHit) => {
    pickedHit.current = hit;
    dispatch({ type: 'PICK_HIT', hit });
  };

  return { state, dispatch, pickHit };
}

async function typeaheadHits(q: string, near: GeoPoint | null | undefined) {
  const hits = await forwardGeocode({ q, intent: GeocodeIntent.Typeahead, nearLat: near?.lat, nearLon: near?.lon, limit: ADDRESS_SEARCH_LIMIT });
  return hits.filter((h) => !h.isArea);
}

const unavailable = (e: unknown) => (e instanceof Error && e.message === GEOCODER_UNAVAILABLE ? e.message : undefined);
