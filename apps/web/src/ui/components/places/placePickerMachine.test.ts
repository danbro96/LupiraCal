import { describe, expect, it } from 'vitest';
import {
  hitContext,
  initialPickerState,
  pinCenterFrom,
  transition,
  unresolvedText,
  type PickerEvent,
  type PickerHit,
  type PickerState,
  type PickerSuggestion,
} from './placePickerMachine';

const place = (id: string, name: string): PickerSuggestion => ({ id, name, type: 'Place' });
const locality = (name: string, lat?: number, lon?: number): PickerSuggestion => ({
  id: `loc-${name}`,
  name,
  type: 'Locality',
  latitude: lat ?? null,
  longitude: lon ?? null,
});
const hit = (displayName: string, extra: Partial<PickerHit> = {}): PickerHit => ({
  displayName,
  latitude: 59.33,
  longitude: 18.07,
  ...extra,
});

function play(events: PickerEvent[], from: PickerState = initialPickerState()) {
  let state = from;
  const commands = [];
  for (const event of events) {
    const t = transition(state, event);
    state = t.state;
    commands.push(...t.commands);
  }
  return { state, commands };
}

describe('commit short-circuit', () => {
  it('exact Place-name match resolves without geocoding', () => {
    const { state, commands } = play([
      { type: 'TYPE', text: 'Home Cafe' },
      { type: 'COMMIT', suggestions: [place('p1', 'home cafe')] },
    ]);
    expect(commands).toEqual([{ kind: 'resolved', placeId: 'p1' }]);
    expect(state.phase.kind).toBe('idle');
    expect(state.text).toBe('');
  });

  it('highlighted suggestion resolves even when the name differs from the text', () => {
    const suggestions = [place('p1', 'ICA Maxi Birsta'), place('p2', 'ICA Nära')];
    const { commands } = play([
      { type: 'TYPE', text: 'ica' },
      { type: 'NAV', dir: 1, optionCount: 2 },
      { type: 'COMMIT', suggestions },
    ]);
    expect(commands).toEqual([{ kind: 'resolved', placeId: 'p1' }]);
  });

  it('unmatched text geocodes instead', () => {
    const { state, commands } = play([
      { type: 'TYPE', text: 'somewhere new' },
      { type: 'COMMIT', suggestions: [place('p1', 'other place')] },
    ]);
    expect(commands).toEqual([{ kind: 'geocode', q: 'somewhere new', token: 1 }]);
    expect(state.phase).toEqual({ kind: 'geocoding', token: 1 });
  });
});

describe('address search', () => {
  it('geocodes even when a place has that exact name', () => {
    const { commands } = play([{ type: 'TYPE', text: 'Home Cafe' }, { type: 'SEARCH' }]);
    expect(commands).toEqual([{ kind: 'geocode', q: 'Home Cafe', token: 1 }]);
  });

  it('is ignored while a preview is open', () => {
    const previewing = play([
      { type: 'TYPE', text: 'somewhere' },
      { type: 'SEARCH' },
      { type: 'GEOCODE_OK', token: 1, hits: [hit('Somewhere 1')] },
    ]).state;
    expect(transition(previewing, { type: 'SEARCH' }).commands).toEqual([]);
  });
});

describe('unresolved text', () => {
  it('is the typed text until a place resolves', () => {
    const typed = play([{ type: 'TYPE', text: 'Storgatan 5 ' }]).state;
    expect(unresolvedText(typed)).toBe('Storgatan 5');
    const previewing = play([{ type: 'SEARCH' }, { type: 'GEOCODE_OK', token: 1, hits: [] }], typed).state;
    expect(unresolvedText(previewing)).toBe('Storgatan 5');
    const resolved = play([{ type: 'COMMIT', suggestions: [place('p1', 'Storgatan 5')] }], typed).state;
    expect(unresolvedText(resolved)).toBeNull();
  });

  it('ignores untouched calendar text', () => {
    expect(unresolvedText(initialPickerState('Kontoret'), 'Kontoret')).toBeNull();
    expect(unresolvedText(initialPickerState(''))).toBeNull();
  });
});

describe('stale tokens', () => {
  it('drops a geocode result after further typing', () => {
    const committed = play([
      { type: 'TYPE', text: 'somewhere' },
      { type: 'COMMIT', suggestions: [] },
      { type: 'TYPE', text: 'somewhere else' },
    ]);
    const { state, commands } = play([{ type: 'GEOCODE_OK', token: 1, hits: [hit('a')] }], committed.state);
    expect(commands).toEqual([]);
    expect(state.phase.kind).toBe('suggesting');
  });

  it('applies only the latest geocode token across re-commits', () => {
    const twice = play([
      { type: 'TYPE', text: 'first' },
      { type: 'COMMIT', suggestions: [] },
      { type: 'TYPE', text: 'second' },
      { type: 'COMMIT', suggestions: [] },
    ]);
    const stale = play([{ type: 'GEOCODE_OK', token: 1, hits: [hit('old')] }], twice.state);
    expect(stale.state.phase).toEqual({ kind: 'geocoding', token: 2 });
    const fresh = play([{ type: 'GEOCODE_OK', token: 2, hits: [hit('new')] }], stale.state);
    expect(fresh.state.phase).toEqual({ kind: 'previewing', hits: [hit('new')], highlight: 0 });
  });

  it('drops a stale CREATE_OK', () => {
    const creating = play([
      { type: 'TYPE', text: 'spot' },
      { type: 'COMMIT', suggestions: [] },
      { type: 'GEOCODE_OK', token: 1, hits: [hit('spot')] },
      { type: 'PICK_HIT', index: 0 },
      { type: 'TYPE', text: 'changed my mind' },
    ]);
    const { state, commands } = play([{ type: 'CREATE_OK', token: 2, placeId: 'p9' }], creating.state);
    expect(commands).toEqual([]);
    expect(state.phase.kind).toBe('suggesting');
  });
});

describe('previewing and pinning', () => {
  const toPreview = (hits: PickerHit[]) =>
    play([
      { type: 'TYPE', text: 'lakeside cabin' },
      { type: 'COMMIT', suggestions: [] },
      { type: 'GEOCODE_OK', token: 1, hits },
    ]);

  it('empty hits still land in previewing so the pin offer shows', () => {
    const { state } = toPreview([]);
    expect(state.phase).toEqual({ kind: 'previewing', hits: [], highlight: 0 });
  });

  it('PICK_HIT emits createFromHit with the typed name and a fresh token', () => {
    const h = hit('Lakeside Cabin, Dalarna', { osmType: 'node', osmId: 42 });
    const { state, commands } = play([{ type: 'PICK_HIT', index: 0 }], toPreview([h]).state);
    expect(commands).toEqual([{ kind: 'createFromHit', hit: h, typedName: 'lakeside cabin', token: 2 }]);
    expect(state.phase).toEqual({ kind: 'creating', token: 2, hits: [h] });
  });

  it('OPEN_PIN then PIN_CONFIRM emits createAtPin', () => {
    const { state, commands } = play(
      [
        { type: 'OPEN_PIN', suggestions: [], hits: [] },
        { type: 'PIN_CONFIRM', lat: 60.1, lon: 15.2 },
      ],
      toPreview([]).state,
    );
    expect(commands).toEqual([{ kind: 'createAtPin', name: 'lakeside cabin', lat: 60.1, lon: 15.2, token: 2 }]);
    expect(state.phase.kind).toBe('creating');
  });

  it('PIN_CANCEL returns to previewing and DISMISS to idle — neither creates', () => {
    const pinning = play([{ type: 'OPEN_PIN', suggestions: [], hits: [] }], toPreview([hit('a')]).state);
    const cancelled = play([{ type: 'PIN_CANCEL' }], pinning.state);
    expect(cancelled.commands).toEqual([]);
    expect(cancelled.state.phase).toEqual({ kind: 'previewing', hits: [hit('a')], highlight: 0 });
    const dismissed = play([{ type: 'DISMISS' }], cancelled.state);
    expect(dismissed.commands).toEqual([]);
    expect(dismissed.state.phase).toEqual({ kind: 'idle' });
  });

  it('CREATE_ERROR recovers to previewing with the hits intact', () => {
    const h = hit('Lakeside Cabin');
    const creating = play([{ type: 'PICK_HIT', index: 0 }], toPreview([h]).state);
    const { state } = play([{ type: 'CREATE_ERROR', token: 2, message: 'boom' }], creating.state);
    expect(state.phase).toEqual({ kind: 'previewing', hits: [h], highlight: 0 });
    expect(state.error).toBe('boom');
    const retry = play([{ type: 'PICK_HIT', index: 0 }], state);
    expect(retry.commands[0]).toMatchObject({ kind: 'createFromHit', token: 3 });
  });

  it('CREATE_OK resolves and resets, keeping seq monotone', () => {
    const h = hit('Lakeside Cabin');
    const creating = play([{ type: 'PICK_HIT', index: 0 }], toPreview([h]).state);
    const { state, commands } = play([{ type: 'CREATE_OK', token: 2, placeId: 'p7' }], creating.state);
    expect(commands).toEqual([{ kind: 'resolved', placeId: 'p7' }]);
    expect(state).toEqual({ text: '', phase: { kind: 'idle' }, error: null, seq: 2 });
  });
});

describe('NAV wrapping', () => {
  it('wraps both directions', () => {
    const start = play([{ type: 'TYPE', text: 'caf' }]);
    const down = play([{ type: 'NAV', dir: -1, optionCount: 3 }], start.state);
    expect(down.state.phase).toEqual({ kind: 'suggesting', highlight: 2 });
    const wrapped = play([{ type: 'NAV', dir: 1, optionCount: 3 }], down.state);
    expect(wrapped.state.phase).toEqual({ kind: 'suggesting', highlight: 0 });
  });

  it('ignores NAV with no options', () => {
    const start = play([{ type: 'TYPE', text: 'caf' }]);
    const { state } = play([{ type: 'NAV', dir: 1, optionCount: 0 }], start.state);
    expect(state.phase).toEqual({ kind: 'suggesting', highlight: -1 });
  });
});

describe('helpers', () => {
  it('pinCenterFrom prefers a Locality with coords at z12', () => {
    expect(pinCenterFrom([place('p', 'x'), locality('Falun', 60.6, 15.6)], [hit('a')])).toEqual({
      center: [15.6, 60.6],
      zoom: 12,
    });
  });

  it('falls back to the first hit at z14, skipping coordinate-less localities', () => {
    expect(pinCenterFrom([locality('Nowhere')], [hit('a', { latitude: 59.1, longitude: 17.5 })])).toEqual({
      center: [17.5, 59.1],
      zoom: 14,
    });
  });

  it('falls back to Sweden at z4 with nothing to go on', () => {
    expect(pinCenterFrom([], [])).toEqual({ center: [16.3, 62.9], zoom: 4 });
  });

  it('hitContext joins locality/region/country, deduped and skipping gaps', () => {
    expect(hitContext(hit('a', { locality: 'Stockholm', region: 'Stockholm', country: 'Sweden' }))).toBe(
      'Stockholm, Sweden',
    );
    expect(hitContext(hit('a', { region: 'Dalarna', country: 'Sweden' }))).toBe('Dalarna, Sweden');
    expect(hitContext(hit('a'))).toBe('');
  });
});
