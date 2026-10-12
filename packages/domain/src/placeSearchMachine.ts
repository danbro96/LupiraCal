// Reducer-with-commands behind the place omnibox. Async results carry the token they were issued with and only
// apply while the machine is still in the phase that minted it, so late answers after further typing are dropped.

import type { PinStart } from '@danbro96/lupira-domain-places/pin';
import { MIN_PLACE_QUERY } from '@danbro96/lupira-domain-places/placeCandidates';
import { placeRequestFromHit, type PlaceRequest } from '@danbro96/lupira-domain-places/places';
import type { OmniboxAddressHit } from './placeOmnibox';
import { selectPlace, type PlaceSelection, type PlaceSelectionVia } from './placeSelection';

export type PlaceSearchPhase =
  | { kind: 'browsing' }
  | { kind: 'typing'; geocodeToken: number | null }
  | { kind: 'resolving'; token: number }
  | { kind: 'pinning'; start: PinStart }
  | { kind: 'creating'; token: number; start: PinStart };

export interface PlaceSearchState {
  text: string;
  phase: PlaceSearchPhase;
  /** The latest address hits for `text`; kept through resolving and pinning so a cancel or failure restores them. */
  hits: OmniboxAddressHit[];
  error: string | null;
  seq: number;
  pinNameRequired: boolean;
}

export type PlaceSearchEvent =
  | { type: 'TYPE'; text: string }
  | { type: 'SEARCH' }
  | { type: 'GEOCODE_OK'; token: number; hits: OmniboxAddressHit[] }
  | { type: 'GEOCODE_ERROR'; token: number; message?: string }
  | { type: 'PICK_PLACE'; placeId: string; label: string; via: Extract<PlaceSelectionVia, 'prediction' | 'search' | 'existing'> }
  | { type: 'PICK_HIT'; hit: OmniboxAddressHit }
  | { type: 'RESOLVE_OK'; token: number; placeId: string; label: string }
  | { type: 'RESOLVE_ERROR'; token: number; message?: string }
  | { type: 'OPEN_PIN'; start: PinStart }
  | { type: 'PIN_CONFIRM'; lat: number; lon: number; name?: string | null }
  | { type: 'PIN_CANCEL' }
  | { type: 'CREATE_OK'; token: number; placeId: string; label: string }
  | { type: 'CREATE_ERROR'; token: number; message?: string }
  | { type: 'DISMISS' };

export type PlaceSearchCommand =
  | { kind: 'geocode'; q: string; token: number }
  | { kind: 'resolveHit'; request: PlaceRequest; token: number }
  | { kind: 'pinPlace'; request: Extract<PlaceRequest, { kind: 'fromPin' }>; token: number }
  | { kind: 'resolved'; selection: PlaceSelection };

export interface PlaceSearchTransition {
  state: PlaceSearchState;
  commands: PlaceSearchCommand[];
}

export const PIN_NAME_NEEDED = 'Name this place.';
export const SEARCH_FAILED = 'Search failed — try again.';
export const CREATE_FAILED = 'Couldn’t create the place.';

export function initialPlaceSearch({ text = '', pinNameRequired }: { text?: string; pinNameRequired: boolean }): PlaceSearchState {
  return { text, phase: phaseFor(text), hits: [], error: null, seq: 0, pinNameRequired };
}

const phaseFor = (text: string): PlaceSearchPhase =>
  text.trim().length >= MIN_PLACE_QUERY ? { kind: 'typing', geocodeToken: null } : { kind: 'browsing' };

const stay = (state: PlaceSearchState): PlaceSearchTransition => ({ state, commands: [] });
const next = (state: PlaceSearchState): PlaceSearchTransition => ({ state, commands: [] });

function resolved(state: PlaceSearchState, selection: PlaceSelection): PlaceSearchTransition {
  return {
    state: { ...state, text: '', phase: { kind: 'browsing' }, hits: [], error: null },
    commands: [{ kind: 'resolved', selection }],
  };
}

/** Typed text not yet turned into a place; a form must not save past it. */
export function unresolvedText(state: PlaceSearchState, initialText = ''): string | null {
  const text = state.text.trim();
  return text && state.text !== initialText ? text : null;
}

export function placeSearchTransition(state: PlaceSearchState, event: PlaceSearchEvent): PlaceSearchTransition {
  const { phase } = state;
  switch (event.type) {
    case 'TYPE':
      return next({ ...state, text: event.text, phase: phaseFor(event.text), hits: [], error: null });

    case 'SEARCH': {
      if (phase.kind !== 'typing') return stay(state);
      const token = state.seq + 1;
      return {
        state: { ...state, seq: token, error: null, phase: { kind: 'typing', geocodeToken: token } },
        commands: [{ kind: 'geocode', q: state.text.trim(), token }],
      };
    }

    case 'GEOCODE_OK':
      if (phase.kind !== 'typing' || phase.geocodeToken !== event.token) return stay(state);
      return next({ ...state, hits: event.hits, phase: { kind: 'typing', geocodeToken: null } });

    case 'GEOCODE_ERROR':
      if (phase.kind !== 'typing' || phase.geocodeToken !== event.token) return stay(state);
      return next({ ...state, error: event.message ?? SEARCH_FAILED, phase: { kind: 'typing', geocodeToken: null } });

    case 'PICK_PLACE':
      if (phase.kind !== 'browsing' && phase.kind !== 'typing') return stay(state);
      return resolved(state, selectPlace(event.placeId, event.label, event.via));

    case 'PICK_HIT': {
      if (phase.kind !== 'typing') return stay(state);
      const token = state.seq + 1;
      const named = event.hit.osmType && event.hit.osmId != null ? undefined : event.hit.displayName;
      return {
        state: { ...state, seq: token, error: null, phase: { kind: 'resolving', token } },
        commands: [{ kind: 'resolveHit', request: placeRequestFromHit(event.hit, named), token }],
      };
    }

    case 'RESOLVE_OK':
      if (phase.kind !== 'resolving' || phase.token !== event.token) return stay(state);
      return resolved(state, selectPlace(event.placeId, event.label, 'geocode'));

    case 'RESOLVE_ERROR':
      if (phase.kind !== 'resolving' || phase.token !== event.token) return stay(state);
      return next({ ...state, phase: { kind: 'typing', geocodeToken: null }, error: event.message ?? CREATE_FAILED });

    case 'OPEN_PIN':
      if (phase.kind !== 'browsing' && phase.kind !== 'typing') return stay(state);
      return next({ ...state, error: null, phase: { kind: 'pinning', start: event.start } });

    case 'PIN_CONFIRM': {
      if (phase.kind !== 'pinning') return stay(state);
      const name = event.name?.trim() || undefined;
      if (!name && state.pinNameRequired) return next({ ...state, error: PIN_NAME_NEEDED });
      const token = state.seq + 1;
      return {
        state: { ...state, seq: token, error: null, phase: { kind: 'creating', token, start: phase.start } },
        commands: [{ kind: 'pinPlace', request: { kind: 'fromPin', ...(name ? { name } : {}), lat: event.lat, lon: event.lon }, token }],
      };
    }

    case 'PIN_CANCEL':
      if (phase.kind !== 'pinning') return stay(state);
      return next({ ...state, error: null, phase: phaseFor(state.text) });

    case 'CREATE_OK':
      if (phase.kind !== 'creating' || phase.token !== event.token) return stay(state);
      return resolved(state, selectPlace(event.placeId, event.label, 'pin'));

    case 'CREATE_ERROR':
      if (phase.kind !== 'creating' || phase.token !== event.token) return stay(state);
      return next({ ...state, phase: { kind: 'pinning', start: phase.start }, error: event.message ?? CREATE_FAILED });

    case 'DISMISS':
      return next({ ...state, error: null, phase: phaseFor(state.text) });
  }
}
