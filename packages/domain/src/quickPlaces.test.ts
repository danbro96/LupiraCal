import { describe, expect, it } from 'vitest';
import { nextPlacedEvents, quickPlaces } from './quickPlaces';

const now = new Date('2026-09-30T12:00:00Z');
const places = new Map([
  ['home', { name: 'Storgatan 1', kind: 'Address', category: 'Home', latitude: 59.33, longitude: 18.07 }],
  ['office', { name: 'Kontoret', latitude: 59.34, longitude: 18.05 }],
  ['venue', { name: 'Bistro', category: 'Restaurant', latitude: 59.31, longitude: 18.08 }],
]);

describe('quickPlaces', () => {
  it('leads with current home then work, then placeable events', () => {
    const chips = quickPlaces({
      now,
      places,
      ownAddresses: [
        { placeId: 'office', type: 'Work' },
        { placeId: 'home', type: 'Home' },
        { placeId: 'old', type: 'Home', movedOut: { year: 2019 } },
      ],
      upcoming: [
        { itemId: 'dinner', title: 'Dinner', start: '2026-10-02T17:00:00Z', placeId: 'venue', color: '#0d9488' },
        { itemId: 'nowhere', title: 'Lost', start: '2026-10-03T17:00:00Z', placeId: 'unknown', color: null },
      ],
    });
    expect(chips.map((c) => [c.kind, c.label.split(' · ')[0]])).toEqual([['home', 'Home'], ['work', 'Work'], ['event', 'Dinner']]);
    expect(chips[0].spanM).toBe(400);
    expect(chips[2].spanM).toBe(250);
  });
});

describe('quickPlaces parents', () => {
  it("puts your parents' home after your own places", () => {
    const chips = quickPlaces({
      now, places, upcoming: [],
      ownAddresses: [{ placeId: 'home', type: 'Home' }],
      parents: [{ placeId: 'office', label: "Parents' home" }],
    });
    expect(chips.map((c) => [c.kind, c.label])).toEqual([['home', 'Home'], ['parents', "Parents' home"]]);
  });
});

describe('nextPlacedEvents', () => {
  it('keeps the next placed occurrence per item, ongoing included, cancelled and past out', () => {
    const rows = nextPlacedEvents([
      { id: 'series', start: '2026-10-14T09:00:00Z', placeId: 'p' },
      { id: 'series', start: '2026-10-07T09:00:00Z', placeId: 'p' },
      { id: 'past', start: '2026-09-01T09:00:00Z', placeId: 'p' },
      { id: 'ongoing', start: '2026-09-30T11:00:00Z', end: '2026-09-30T13:00:00Z', placeId: 'p' },
      { id: 'cancelled', start: '2026-10-01T09:00:00Z', placeId: 'p', status: 'Cancelled' },
      { id: 'unplaced', start: '2026-10-01T09:00:00Z', placeId: null },
    ], now);
    expect(rows.map((r) => [r.id, r.start.slice(0, 10)])).toEqual([['ongoing', '2026-09-30'], ['series', '2026-10-07']]);
  });
});
