import { describe, expect, it } from 'vitest';
import { plural } from './wording';

describe('plural', () => {
  it('counts with the right form', () => {
    expect(plural(1, 'photo')).toBe('1 photo');
    expect(plural(0, 'photo')).toBe('0 photos');
    expect(plural(2, 'person', 'people')).toBe('2 people');
  });
});
