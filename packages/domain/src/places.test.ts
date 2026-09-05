import { describe, expect, it } from 'vitest';
import { formatCoords, osmUrl } from './places';

describe('osmUrl', () => {
  it('builds a map link from numeric coords', () => {
    expect(osmUrl(59.3293, 18.0686)).toBe('https://www.openstreetmap.org/?mlat=59.3293&mlon=18.0686#map=16/59.3293/18.0686');
  });

  it('is null when a component is missing or NaN', () => {
    expect(osmUrl(null, 18)).toBeNull();
    expect(osmUrl(59, undefined)).toBeNull();
    expect(osmUrl(Number.NaN, 18)).toBeNull();
  });
});

describe('formatCoords', () => {
  it('formats to 5 decimals', () => {
    expect(formatCoords(59.3293, 18.0686)).toBe('59.32930, 18.06860');
  });

  it('is null when incomplete', () => {
    expect(formatCoords(null, null)).toBeNull();
  });
});
import { PLACE_LOOKUP_MAX, chunk, distinctPlaceIds, toLocatedPlaces } from './places';

describe('distinctPlaceIds', () => {
  it('drops nulls and duplicates and sorts, so equal sets make equal keys', () => {
    expect(distinctPlaceIds(['b', null, 'a', undefined, 'b'])).toEqual(['a', 'b']);
    expect(distinctPlaceIds(['a', 'b'])).toEqual(distinctPlaceIds(['b', 'a']));
  });
});

describe('chunk', () => {
  it('splits at the size and keeps the tail', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it('honours the server cap', () => {
    const ids = Array.from({ length: PLACE_LOOKUP_MAX + 1 }, (_, i) => `p${i}`);
    expect(chunk(ids, PLACE_LOOKUP_MAX).map((c) => c.length)).toEqual([PLACE_LOOKUP_MAX, 1]);
  });
});

describe('toLocatedPlaces', () => {
  it('keeps only located places, under the requested id', () => {
    const map = toLocatedPlaces([
      { requestedId: 'merged', place: { latitude: 1, longitude: 2, id: 'survivor' } },
      { requestedId: 'unlocated', place: { latitude: null, longitude: 2 } },
      { requestedId: 'gone', place: null },
    ]);
    expect([...map.keys()]).toEqual(['merged']);
    expect(map.get('merged')?.id).toBe('survivor');
  });
});
