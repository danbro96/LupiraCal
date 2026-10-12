import { describe, expect, it } from 'vitest';
import type { PlaceDto, PlaceUsageDto } from '@lupira/cal-api/models';
import type { ContactAddressRow } from '@danbro96/lupira-domain-contacts/residents';
import { currentHomes, predictionSources, sourcePlaceIds, toPlaceUsage } from './placeSources';

const today = new Date('2026-10-12T12:00:00Z');
const row = (contactId: string, placeId: string, extra: Partial<ContactAddressRow> = {}): ContactAddressRow =>
  ({ contactId, displayName: contactId, placeId, addressType: 'Home', ...extra });
const place = (id: string, extra: Partial<PlaceDto> = {}) =>
  ({ id, name: id, kind: 'Poi', category: 'Restaurant', source: 'Manual', verified: false, latitude: 59, longitude: 13, ...extra }) as PlaceDto;

describe('currentHomes', () => {
  it('groups current Home residencies of the asked contacts by place', () => {
    const rows = [
      row('anna', 'p1'),
      row('erik', 'p1'),
      row('anna', 'old', { movedOut: { year: 2020 } }),
      row('anna', 'work', { addressType: 'Work' }),
      row('olle', 'p2'),
    ];
    expect(currentHomes(rows, ['anna', 'erik'], today)).toEqual([{ placeId: 'p1', contactIds: ['anna', 'erik'] }]);
  });
});

describe('toPlaceUsage', () => {
  it('drops categories the domain does not know', () => {
    const dto = {
      placeId: 'p1', label: null, eventCount: 3, lastDay: '2026-10-01', companions: [],
      byCategory: [{ category: 'Meal', eventCount: 2, lastDay: '2026-10-01' }, { category: 'Brunch', eventCount: 1, lastDay: '2026-09-01' }],
    } as unknown as PlaceUsageDto;
    expect(toPlaceUsage([dto])[0].byCategory).toEqual([{ category: 'Meal', eventCount: 2, lastDay: '2026-10-01' }]);
  });
});

describe('predictionSources', () => {
  const input = {
    usage: [],
    rows: [row('me', 'home'), row('anna', 'annas')],
    attendeeIds: ['anna'],
    householdHomes: [],
    myContactId: 'me',
    saved: [{ placeId: 'fav', label: 'Fav' }, { placeId: null, label: 'Unplaced' }],
    hotspots: [{ placeId: null, label: 'cell', activeDays: 4, lastDay: '2026-10-01' }],
    places: new Map([['annas', place('annas', { name: 'Annas hus', category: 'Home' })]]),
  };

  it('finds your home, attendee homes and only placed saved places and hotspots', () => {
    const s = predictionSources(input, today);
    expect(s.ownHomePlaceId).toBe('home');
    expect(s.attendeeHomes).toEqual([{ placeId: 'annas', contactIds: ['anna'] }]);
    expect(s.saved).toEqual([{ placeId: 'fav', label: 'Fav' }]);
    expect(s.hotspots).toEqual([]);
    expect(s.placeMeta.get('annas')).toEqual({ label: 'Annas hus', placeCategory: 'Home', lat: 59, lon: 13 });
  });

  it('has no own home without a linked contact', () => {
    expect(predictionSources({ ...input, myContactId: null }, today).ownHomePlaceId).toBeNull();
  });

  it('collects every mentioned place id for the lookup', () => {
    expect(sourcePlaceIds(input)).toEqual(['home', 'annas', 'fav']);
  });
});
