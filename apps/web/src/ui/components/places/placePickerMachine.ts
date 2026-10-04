// Pure reducer-with-commands behind PlacePicker. Structural mini-types keep it decoupled from the
// generated DTOs so it stays unit-testable in node. Async results carry the token they were issued
// with; a result only applies while the machine is still in the phase that minted that token — this
// is what makes late geocode/create responses harmless after further typing.

import { MIN_PLACE_QUERY } from '@lupira/cal-domain/placeCandidates';

export type PickerSuggestion = {
  id: string;
  name: string;
  type: 'Place' | 'Locality';
  latitude?: number | null;
  longitude?: number | null;
  context?: string | null;
};

export type PickerHit = {
  displayName: string;
  latitude: number;
  longitude: number;
  category?: string | null;
  locality?: string | null;
  region?: string | null;
  country?: string | null;
  osmType?: string | null;
  osmId?: number | null;
};

// pinning/creating keep the preview hits so cancel/error can restore the previewing phase.
export type PickerPhase =
  | { kind: 'idle' }
  | { kind: 'suggesting'; highlight: number }
  | { kind: 'geocoding'; token: number }
  | { kind: 'previewing'; hits: PickerHit[]; highlight: number }
  | { kind: 'pinning'; center: [number, number]; zoom: number; hits: PickerHit[] }
  | { kind: 'creating'; token: number; hits: PickerHit[] };

export type PickerState = {
  text: string;
  phase: PickerPhase;
  error: string | null;
  seq: number;
};

export type PickerEvent =
  | { type: 'TYPE'; text: string }
  | { type: 'NAV'; dir: 1 | -1; optionCount: number }
  | { type: 'COMMIT'; suggestions: PickerSuggestion[] }
  | { type: 'GEOCODE_OK'; token: number; hits: PickerHit[] }
  | { type: 'GEOCODE_ERROR'; token: number; message?: string }
  | { type: 'PICK_HIT'; index: number }
  | { type: 'OPEN_PIN'; suggestions: PickerSuggestion[]; hits: PickerHit[] }
  | { type: 'PIN_CONFIRM'; lat: number; lon: number }
  | { type: 'PIN_CANCEL' }
  | { type: 'CREATE_OK'; token: number; placeId: string }
  | { type: 'CREATE_ERROR'; token: number; message?: string }
  | { type: 'DISMISS' };

export type PickerCommand =
  | { kind: 'geocode'; q: string; token: number }
  | { kind: 'createFromHit'; hit: PickerHit; typedName: string; token: number }
  | { kind: 'createAtPin'; name: string; lat: number; lon: number; token: number }
  | { kind: 'resolved'; placeId: string };

export type PickerTransition = { state: PickerState; commands: PickerCommand[] };

export function initialPickerState(text = ''): PickerState {
  return { text, phase: { kind: 'idle' }, error: null, seq: 0 };
}

const stay = (state: PickerState): PickerTransition => ({ state, commands: [] });
const next = (state: PickerState): PickerTransition => ({ state, commands: [] });

/** Post-resolve reset: seq survives so tokens stay monotone across resolves. */
const reset = (state: PickerState): PickerState => ({ text: '', phase: { kind: 'idle' }, error: null, seq: state.seq });

export function transition(state: PickerState, event: PickerEvent): PickerTransition {
  switch (event.type) {
    case 'TYPE': {
      // Leaving geocoding/creating orphans any in-flight token (results check phase + token).
      const phase: PickerPhase =
        event.text.trim().length >= MIN_PLACE_QUERY ? { kind: 'suggesting', highlight: -1 } : { kind: 'idle' };
      return next({ ...state, text: event.text, phase, error: null });
    }

    case 'NAV': {
      if (event.optionCount <= 0) return stay(state);
      if (state.phase.kind !== 'suggesting' && state.phase.kind !== 'previewing') return stay(state);
      const from = state.phase.highlight < 0 ? (event.dir === 1 ? -1 : 0) : state.phase.highlight;
      const highlight = (from + event.dir + event.optionCount) % event.optionCount;
      return next({ ...state, phase: { ...state.phase, highlight } });
    }

    case 'COMMIT': {
      if (state.phase.kind !== 'suggesting' && state.phase.kind !== 'idle') return stay(state);
      const q = state.text.trim();
      if (!q) return stay(state);
      const highlight = state.phase.kind === 'suggesting' ? state.phase.highlight : -1;
      const match =
        (highlight >= 0 ? event.suggestions[highlight] : undefined) ??
        event.suggestions.find((s) => s.type === 'Place' && s.name.toLowerCase() === q.toLowerCase());
      if (match && match.type === 'Place') {
        return { state: reset(state), commands: [{ kind: 'resolved', placeId: match.id }] };
      }
      const token = state.seq + 1;
      return {
        state: { ...state, seq: token, error: null, phase: { kind: 'geocoding', token } },
        commands: [{ kind: 'geocode', q, token }],
      };
    }

    case 'GEOCODE_OK': {
      if (state.phase.kind !== 'geocoding' || state.phase.token !== event.token) return stay(state);
      // Empty hits still land in previewing — the UI shows "No matches" plus the pin offer.
      return next({ ...state, phase: { kind: 'previewing', hits: event.hits, highlight: 0 } });
    }

    case 'GEOCODE_ERROR': {
      if (state.phase.kind !== 'geocoding' || state.phase.token !== event.token) return stay(state);
      return next({
        ...state,
        phase: { kind: 'suggesting', highlight: -1 },
        error: event.message ?? 'Search failed — try again.',
      });
    }

    case 'PICK_HIT': {
      if (state.phase.kind !== 'previewing') return stay(state);
      const hit = state.phase.hits[event.index];
      if (!hit) return stay(state);
      const token = state.seq + 1;
      return {
        state: { ...state, seq: token, error: null, phase: { kind: 'creating', token, hits: state.phase.hits } },
        commands: [{ kind: 'createFromHit', hit, typedName: state.text.trim(), token }],
      };
    }

    case 'OPEN_PIN': {
      if (state.phase.kind !== 'previewing') return stay(state);
      const { center, zoom } = pinCenterFrom(event.suggestions, event.hits);
      return next({ ...state, phase: { kind: 'pinning', center, zoom, hits: state.phase.hits } });
    }

    case 'PIN_CONFIRM': {
      if (state.phase.kind !== 'pinning') return stay(state);
      const name = state.text.trim();
      if (!name) return stay(state);
      const token = state.seq + 1;
      return {
        state: { ...state, seq: token, error: null, phase: { kind: 'creating', token, hits: state.phase.hits } },
        commands: [{ kind: 'createAtPin', name, lat: event.lat, lon: event.lon, token }],
      };
    }

    case 'PIN_CANCEL': {
      if (state.phase.kind !== 'pinning') return stay(state);
      return next({ ...state, phase: { kind: 'previewing', hits: state.phase.hits, highlight: 0 } });
    }

    case 'CREATE_OK': {
      if (state.phase.kind !== 'creating' || state.phase.token !== event.token) return stay(state);
      return { state: reset(state), commands: [{ kind: 'resolved', placeId: event.placeId }] };
    }

    case 'CREATE_ERROR': {
      if (state.phase.kind !== 'creating' || state.phase.token !== event.token) return stay(state);
      return next({
        ...state,
        phase: { kind: 'previewing', hits: state.phase.hits, highlight: 0 },
        error: event.message ?? 'Couldn’t create the place.',
      });
    }

    case 'DISMISS':
      return next({ ...state, phase: { kind: 'idle' }, error: null });
  }
}

const SWEDEN: { center: [number, number]; zoom: number } = { center: [16.3, 62.9], zoom: 4 };

/** Best map view to start pinning from: the typed area beats a rejected hit beats the country. */
export function pinCenterFrom(
  suggestions: readonly PickerSuggestion[],
  hits: readonly PickerHit[],
): { center: [number, number]; zoom: number } {
  for (const s of suggestions) {
    if (s.type === 'Locality' && s.latitude != null && s.longitude != null) {
      return { center: [s.longitude, s.latitude], zoom: 12 };
    }
  }
  const hit = hits[0];
  if (hit) return { center: [hit.longitude, hit.latitude], zoom: 14 };
  return SWEDEN;
}

/** "locality, region, country" context line for a geocoder hit (deduped, missing parts skipped). */
export function hitContext(hit: PickerHit): string {
  const parts: string[] = [];
  for (const part of [hit.locality, hit.region, hit.country]) {
    if (part && !parts.includes(part)) parts.push(part);
  }
  return parts.join(', ');
}
