import { describe, expect, it } from 'vitest';
import {
  CREATE_FAILED, PIN_NAME_NEEDED, initialPlaceSearch, placeSearchTransition, unresolvedText,
  type PlaceSearchEvent, type PlaceSearchState,
} from './placeSearchMachine';
import type { OmniboxAddressHit } from './placeOmnibox';

const start = { lat: 56.8, lon: 13.9, zoom: 13 };
const hit = (displayName: string, extra: Partial<OmniboxAddressHit> = {}): OmniboxAddressHit =>
  ({ displayName, latitude: 56.83, longitude: 13.94, ...extra });

function play(events: PlaceSearchEvent[], from: PlaceSearchState = initialPlaceSearch({ pinNameRequired: true })) {
  let state = from;
  const commands = [];
  for (const event of events) {
    const t = placeSearchTransition(state, event);
    state = t.state;
    commands.push(...t.commands);
  }
  return { state, commands };
}

const typed = (text: string) => play([{ type: 'TYPE', text }, { type: 'SEARCH' }]);

describe('browsing and typing', () => {
  it('stays browsing below the minimum query and types from it', () => {
    expect(play([{ type: 'TYPE', text: 'a' }]).state.phase).toEqual({ kind: 'browsing' });
    expect(play([{ type: 'TYPE', text: 'ab' }]).state.phase).toEqual({ kind: 'typing', geocodeToken: null });
  });

  it('a search geocodes the trimmed text with a fresh token', () => {
    const { state, commands } = typed(' storgatan 5 ');
    expect(commands).toEqual([{ kind: 'geocode', q: 'storgatan 5', token: 1 }]);
    expect(state.phase).toEqual({ kind: 'typing', geocodeToken: 1 });
  });

  it('picking a listed place resolves a selection and resets', () => {
    const { state, commands } = play([
      { type: 'TYPE', text: 'caf' },
      { type: 'PICK_PLACE', placeId: 'p1', label: 'Café', via: 'search' },
    ]);
    expect(commands).toEqual([{ kind: 'resolved', selection: { placeId: 'p1', label: 'Café', via: 'search' } }]);
    expect(state).toMatchObject({ text: '', phase: { kind: 'browsing' }, hits: [] });
  });
});

describe('stale results', () => {
  it('drops a geocode answer after further typing', () => {
    const { state } = play([{ type: 'TYPE', text: 'storgatan 7' }, { type: 'GEOCODE_OK', token: 1, hits: [hit('old')] }], typed('storgatan').state);
    expect(state.hits).toEqual([]);
    expect(state.phase).toEqual({ kind: 'typing', geocodeToken: null });
  });

  it('applies only the latest geocode token', () => {
    const twice = play([{ type: 'SEARCH' }], typed('storgatan').state);
    const stale = play([{ type: 'GEOCODE_OK', token: 1, hits: [hit('old')] }], twice.state);
    expect(stale.state.hits).toEqual([]);
    const fresh = play([{ type: 'GEOCODE_OK', token: 2, hits: [hit('new')] }], stale.state);
    expect(fresh.state.hits).toEqual([hit('new')]);
  });

  it('drops a resolve answer once the user typed on', () => {
    const resolving = play([
      { type: 'GEOCODE_OK', token: 1, hits: [hit('Storgatan 5', { osmType: 'way', osmId: 7 })] },
      { type: 'PICK_HIT', hit: hit('Storgatan 5', { osmType: 'way', osmId: 7 }) },
      { type: 'TYPE', text: 'something else' },
    ], typed('storgatan').state);
    const { commands, state } = play([{ type: 'RESOLVE_OK', token: 2, placeId: 'p9', label: 'Storgatan 5' }], resolving.state);
    expect(commands).toEqual([]);
    expect(state.text).toBe('something else');
  });

  it('a geocode error keeps typing with a message', () => {
    const { state } = play([{ type: 'GEOCODE_ERROR', token: 1 }], typed('storgatan').state);
    expect(state.phase).toEqual({ kind: 'typing', geocodeToken: null });
    expect(state.error).toBeTruthy();
  });
});

describe('resolving an address hit', () => {
  it('resolves an OSM hit server-side and leaves naming to the server', () => {
    const h = hit('Storgatan 5, Ljungby', { osmType: 'node', osmId: 42 });
    const { state, commands } = play([{ type: 'GEOCODE_OK', token: 1, hits: [h] }, { type: 'PICK_HIT', hit: h }], typed('storgatan').state);
    expect(commands).toEqual([{ kind: 'resolveHit', request: { kind: 'fromGeocode', osmType: 'node', osmId: 42 }, token: 2 }]);
    expect(state.phase).toEqual({ kind: 'resolving', token: 2 });
  });

  it('pins a hit without OSM identity under its display name', () => {
    const h = hit('Lakeside');
    const { commands } = play([{ type: 'PICK_HIT', hit: h }], typed('lake').state);
    expect(commands).toEqual([{ kind: 'resolveHit', request: { kind: 'fromPin', name: 'Lakeside', lat: 56.83, lon: 13.94 }, token: 2 }]);
  });

  it('a resolved hit becomes a geocode selection', () => {
    const resolving = play([{ type: 'PICK_HIT', hit: hit('x', { osmType: 'way', osmId: 1 }) }], typed('storgatan').state);
    const { commands } = play([{ type: 'RESOLVE_OK', token: 2, placeId: 'p7', label: 'Storgatan 5' }], resolving.state);
    expect(commands).toEqual([{ kind: 'resolved', selection: { placeId: 'p7', label: 'Storgatan 5', via: 'geocode' } }]);
  });

  it('a failed resolve returns to typing with the hits intact', () => {
    const h = hit('x', { osmType: 'way', osmId: 1 });
    const resolving = play([{ type: 'GEOCODE_OK', token: 1, hits: [h] }, { type: 'PICK_HIT', hit: h }], typed('storgatan').state);
    const { state } = play([{ type: 'RESOLVE_ERROR', token: 2 }], resolving.state);
    expect(state).toMatchObject({ phase: { kind: 'typing' }, hits: [h], error: CREATE_FAILED, text: 'storgatan' });
  });
});

describe('pinning', () => {
  it('an event pin needs a name', () => {
    const { state, commands } = play([{ type: 'OPEN_PIN', start }, { type: 'PIN_CONFIRM', lat: 60, lon: 15, name: ' ' }]);
    expect(commands).toEqual([]);
    expect(state.error).toBe(PIN_NAME_NEEDED);
    expect(state.phase.kind).toBe('pinning');
  });

  it('a residency pin may go unnamed', () => {
    const { commands } = play(
      [{ type: 'OPEN_PIN', start }, { type: 'PIN_CONFIRM', lat: 60, lon: 15 }],
      initialPlaceSearch({ pinNameRequired: false }),
    );
    expect(commands).toEqual([{ kind: 'pinPlace', request: { kind: 'fromPin', lat: 60, lon: 15 }, token: 1 }]);
  });

  it('a confirmed pin creates and resolves as a pin selection, keeping tokens monotone', () => {
    const creating = play([{ type: 'OPEN_PIN', start }, { type: 'PIN_CONFIRM', lat: 60, lon: 15, name: 'Stugan' }], typed('stugan').state);
    expect(creating.commands.at(-1)).toEqual({ kind: 'pinPlace', request: { kind: 'fromPin', name: 'Stugan', lat: 60, lon: 15 }, token: 2 });
    const { state, commands } = play([{ type: 'CREATE_OK', token: 2, placeId: 'p3', label: 'Stugan' }], creating.state);
    expect(commands).toEqual([{ kind: 'resolved', selection: { placeId: 'p3', label: 'Stugan', via: 'pin' } }]);
    expect(state.seq).toBe(2);
  });

  it('a failed create returns to the pin with its start', () => {
    const creating = play([{ type: 'OPEN_PIN', start }, { type: 'PIN_CONFIRM', lat: 60, lon: 15, name: 'Stugan' }]);
    const { state } = play([{ type: 'CREATE_ERROR', token: 1, message: 'boom' }], creating.state);
    expect(state).toMatchObject({ phase: { kind: 'pinning', start }, error: 'boom' });
  });

  it('cancel and dismiss never create', () => {
    const pinning = play([{ type: 'OPEN_PIN', start }], typed('stugan').state);
    const cancelled = play([{ type: 'PIN_CANCEL' }], pinning.state);
    expect(cancelled.commands).toEqual([]);
    expect(cancelled.state.phase).toEqual({ kind: 'typing', geocodeToken: null });
    const creating = play([{ type: 'OPEN_PIN', start }, { type: 'PIN_CONFIRM', lat: 1, lon: 2, name: 'x' }], cancelled.state);
    const dismissed = play([{ type: 'DISMISS' }, { type: 'CREATE_OK', token: 2, placeId: 'p', label: 'x' }], creating.state);
    expect(dismissed.commands).toEqual([]);
  });
});

describe('unresolvedText', () => {
  it('is the typed text until a place resolves', () => {
    const t = play([{ type: 'TYPE', text: 'Storgatan 5 ' }]).state;
    expect(unresolvedText(t)).toBe('Storgatan 5');
    const resolved = play([{ type: 'PICK_PLACE', placeId: 'p', label: 'Storgatan 5', via: 'search' }], t).state;
    expect(unresolvedText(resolved)).toBeNull();
  });

  it('ignores untouched stored text', () => {
    expect(unresolvedText(initialPlaceSearch({ text: 'Kontoret', pinNameRequired: true }), 'Kontoret')).toBeNull();
  });
});
