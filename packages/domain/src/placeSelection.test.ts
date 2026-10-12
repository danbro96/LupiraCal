import { describe, expect, it } from 'vitest';
import { fromStored, selectPlace } from './placeSelection';

describe('selectPlace', () => {
  it('carries id, trimmed label and how it was found', () => {
    expect(selectPlace('p1', ' Café ', 'search')).toEqual({ placeId: 'p1', label: 'Café', via: 'search' });
  });

  it('refuses an empty id or label', () => {
    expect(() => selectPlace('', 'Café', 'search')).toThrow();
    expect(() => selectPlace('p1', '  ', 'pin')).toThrow();
  });
});

describe('fromStored', () => {
  it('wraps an existing item place, tolerating a missing label', () => {
    expect(fromStored('p1', null)).toEqual({ placeId: 'p1', label: '', via: 'existing' });
  });

  it('refuses an empty id', () => {
    expect(() => fromStored(' ', 'Café')).toThrow();
  });
});
