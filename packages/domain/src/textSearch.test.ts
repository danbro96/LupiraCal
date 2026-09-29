import { describe, expect, it } from 'vitest';
import { matchesTerms, searchTerms } from './textSearch';

describe('matchesTerms', () => {
  it('needs every word, in any field, in any case', () => {
    const terms = searchTerms('  ÅSA  svens ');
    expect(terms).toEqual(['åsa', 'svens']);
    expect(matchesTerms(terms, 'Åsa', 'Svensson')).toBe(true);
    expect(matchesTerms(terms, 'Åsa Lind')).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(matchesTerms(searchTerms(''), 'anything')).toBe(true);
  });
});
