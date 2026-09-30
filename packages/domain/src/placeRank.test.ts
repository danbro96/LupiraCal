import { describe, expect, it } from 'vitest';
import { mergeCandidates, rankPlaces, type PlaceCandidate, type PlaceRankContext } from './placeRank';

const now = new Date('2026-09-30T12:00:00Z');
const ctx = (over: Partial<PlaceRankContext> = {}): PlaceRankContext => ({ query: '', now, attendeeIds: new Set(), ...over });
const ids = (list: PlaceCandidate[]) => list.map((c) => c.placeId);

describe('rankPlaces', () => {
  it('ranks a recent haunt above one abandoned years ago', () => {
    const ranked = rankPlaces([
      { placeId: 'old-gym', label: 'Gym', hotspot: { activeDays: 120, lastDay: '2023-01-10' } },
      { placeId: 'cafe', label: 'Café', hotspot: { activeDays: 8, lastDay: '2026-09-20' } },
    ], ctx());
    expect(ids(ranked)).toEqual(['cafe', 'old-gym']);
  });

  it("leads with a selected attendee's home", () => {
    const ranked = rankPlaces([
      { placeId: 'saved', label: 'Office', saved: true, hotspot: { activeDays: 200, lastDay: '2026-09-29' } },
      { placeId: 'annas', label: 'Storgatan 1', residents: [{ contactId: 'anna', status: 'active' }] },
    ], ctx({ attendeeIds: new Set(['anna']) }));
    expect(ids(ranked)).toEqual(['annas', 'saved']);
  });

  it('drops what the query does not match, and finds a place by its resident', () => {
    const ranked = rankPlaces([
      { placeId: 'office', label: 'Office', saved: true },
      { placeId: 'annas', label: 'Storgatan 1', viaContact: { contactId: 'anna', status: 'active' }, residents: [{ contactId: 'anna', status: 'active' }] },
    ], ctx({ query: 'ann' }));
    expect(ids(ranked)).toEqual(['annas']);
  });

  it('keeps a former address findable but below a current one', () => {
    const ranked = rankPlaces([
      { placeId: 'then', label: 'Old flat', viaContact: { contactId: 'anna', status: 'former' } },
      { placeId: 'suggested', label: 'Annas Bageri', suggestRank: 3 },
      { placeId: 'now', label: 'Home', viaContact: { contactId: 'anna', status: 'active' }, residents: [{ contactId: 'anna', status: 'active' }] },
    ], ctx({ query: 'anna' }));
    expect(ids(ranked)).toEqual(['now', 'suggested', 'then']);
  });

  it('breaks ties by distance to the event', () => {
    const ranked = rankPlaces([
      { placeId: 'far', label: 'Pizza Göteborg', point: { lat: 57.7, lon: 11.97 } },
      { placeId: 'near', label: 'Pizza Söder', point: { lat: 59.31, lon: 18.07 } },
    ], ctx({ query: 'pizza', origin: { lat: 59.33, lon: 18.07 } }));
    expect(ids(ranked)).toEqual(['near', 'far']);
  });

  it('weighs a resident by how much you meet them', () => {
    const ranked = rankPlaces([
      { placeId: 'bos', label: 'B', residents: [{ contactId: 'bo', status: 'active' }] },
      { placeId: 'annas', label: 'A', residents: [{ contactId: 'anna', status: 'active' }] },
    ], ctx({ contactScores: new Map([['anna', 5], ['bo', 0.5]]) }));
    expect(ids(ranked)).toEqual(['annas', 'bos']);
  });
});

describe('mergeCandidates', () => {
  it('folds every source of one place into one candidate', () => {
    const [merged, ...rest] = mergeCandidates([
      { placeId: 'p', label: 'Home', saved: true },
      { placeId: 'p', label: 'Home', suggestRank: 2, residents: [{ contactId: 'anna', status: 'active' }] },
      { placeId: 'p', label: 'Home', suggestRank: 1, residents: [{ contactId: 'anna', status: 'active' }] },
    ]);
    expect(rest).toEqual([]);
    expect(merged).toMatchObject({ saved: true, suggestRank: 1, residents: [{ contactId: 'anna', status: 'active' }] });
  });
});
