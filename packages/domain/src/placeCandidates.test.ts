import { describe, expect, it } from 'vitest';
import { eventOrigin, pickPlaces, type PlacePickerInput } from './placeCandidates';

const now = new Date(2026, 8, 30);
const base: PlacePickerInput = {
  query: '', now, saved: [], hotspots: [], suggestions: [], attendeeIds: [],
  addresses: [
    { contactId: 'anna', displayName: 'Anna Svensson', placeId: 'annas', addressType: 'Home' },
    { contactId: 'anna', displayName: 'Anna Svensson', placeId: 'old', addressType: 'Home', movedOut: { year: 2019 } },
  ],
  places: new Map([
    ['annas', { name: 'Storgatan 1', formattedAddress: 'Storgatan 1, Stockholm', latitude: 59.33, longitude: 18.07 }],
    ['old', { name: 'Lillgatan 2', latitude: 59.3, longitude: 18.0 }],
  ]),
};

describe('pickPlaces', () => {
  it("offers an invited person's current home before anything is typed", () => {
    const { places } = pickPlaces({ ...base, attendeeIds: ['anna'] });
    expect(places.map((p) => [p.placeId, p.residentsLine])).toEqual([['annas', 'Anna Svensson lives here']]);
  });

  it("finds a contact's addresses by name, the former one last and muted", () => {
    const { places } = pickPlaces({ ...base, query: 'anna' });
    expect(places.map((p) => p.placeId)).toEqual(['annas', 'old']);
    expect(places[1].otherLine).toBe('Anna Svensson lived here ?–2019');
  });

  it('places a geocoder hit at a resident’s address within 30 m', () => {
    const { residentsNear } = pickPlaces(base);
    expect(residentsNear({ lat: 59.33005, lon: 18.07 })).toBe('Anna Svensson lives here');
    expect(residentsNear({ lat: 59.34, lon: 18.07 })).toBeNull();
  });
});

describe('eventOrigin', () => {
  it("averages the day's located places, else falls back", () => {
    expect(eventOrigin([{ latitude: 59, longitude: 18 }, { latitude: 61, longitude: 20 }, {}], null)).toEqual({ lat: 60, lon: 19 });
    expect(eventOrigin([], { lat: 1, lon: 2 })).toEqual({ lat: 1, lon: 2 });
  });
});
