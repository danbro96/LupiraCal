import { describe, expect, it } from 'vitest';
import { rankByInteraction } from './contactRank';

const c = (id: string) => ({ id });

describe('rankByInteraction', () => {
  it('ranks recent interaction above a long-gone history', () => {
    const ranked = rankByInteraction(
      [c('anna'), c('bo')],
      [
        { contactId: 'anna', count: 40, lastAt: '2023-01-01T12:00:00Z', score: 0.1 },
        { contactId: 'bo', count: 3, lastAt: '2026-09-01T12:00:00Z', score: 2.6 },
      ],
    );
    expect(ranked.map((x) => x.id)).toEqual(['bo', 'anna']);
  });

  it('orders by count desc, then lastAt desc, unmatched last', () => {
    const ranked = rankByInteraction(
      [c('anna'), c('bo'), c('cia'), c('dag')],
      [
        { contactId: 'cia', count: 2, lastAt: '2026-06-01T12:00:00Z' },
        { contactId: 'bo', count: 5, lastAt: '2026-01-01T12:00:00Z' },
        { contactId: 'dag', count: 2, lastAt: '2026-07-01T12:00:00Z' },
      ],
    );
    expect(ranked.map((x) => x.id)).toEqual(['bo', 'dag', 'cia', 'anna']);
  });

  it('keeps base order on ties and without a summary', () => {
    const contacts = [c('anna'), c('bo')];
    expect(rankByInteraction(contacts, undefined).map((x) => x.id)).toEqual(['anna', 'bo']);
    expect(rankByInteraction(contacts, []).map((x) => x.id)).toEqual(['anna', 'bo']);
    expect(
      rankByInteraction(contacts, [
        { contactId: 'anna', count: 1 },
        { contactId: 'bo', count: 1 },
      ]).map((x) => x.id),
    ).toEqual(['anna', 'bo']);
  });

  it('ranks by count and tolerates bad dates', () => {
    const ranked = rankByInteraction(
      [c('anna'), c('bo')],
      [
        { contactId: 'anna', count: 2, lastAt: 'not-a-date' },
        { contactId: 'bo', count: 10 },
      ],
    );
    expect(ranked.map((x) => x.id)).toEqual(['bo', 'anna']);
  });
});
