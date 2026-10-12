import { describe, expect, it } from 'vitest';
import {
  EMPTY_ADDRESS_DRAFT, UNFINISHED_ADDRESS, addressPlaceName, addressQuery, draftFromComponents, normalizePostcode,
  residencyRowState, residencySaveError,
} from './addressDraft';

describe('addressQuery', () => {
  it('waits for a street plus a postcode or locality', () => {
    expect(addressQuery(EMPTY_ADDRESS_DRAFT)).toBeNull();
    expect(addressQuery({ ...EMPTY_ADDRESS_DRAFT, street: 'Storgatan 5' })).toBeNull();
    expect(addressQuery({ ...EMPTY_ADDRESS_DRAFT, locality: 'Ljungby' })).toBeNull();
  });

  it('builds structured params and a one-line query', () => {
    expect(addressQuery({ street: ' Storgatan 5 ', postcode: '34130', locality: 'Ljungby', countryCode: 'se' })).toEqual({
      street: 'Storgatan 5', postcode: '341 30', locality: 'Ljungby', countryCode: 'SE', q: 'Storgatan 5, 341 30 Ljungby',
    });
    expect(addressQuery({ ...EMPTY_ADDRESS_DRAFT, street: 'Storgatan 5', locality: 'Ljungby' }))
      .toEqual({ street: 'Storgatan 5', locality: 'Ljungby', q: 'Storgatan 5, Ljungby' });
  });
});

describe('normalizePostcode', () => {
  it.each([
    ['SE', '34130', '341 30'],
    ['se', '341 30', '341 30'],
    ['NO', ' 0150 ', '0150'],
    ['DK', '2100', '2100'],
    ['FI', '00100', '00100'],
    ['EE', '10111', '10111'],
    ['LV', '1050', 'LV-1050'],
    ['LV', 'lv 1050', 'LV-1050'],
    ['LT', 'LT-01100', 'LT-01100'],
    ['LT', '01100', 'LT-01100'],
    ['SE', '3413', '3413'],
    ['DE', ' 10115 ', '10115'],
    [null, ' AB1 2CD ', 'AB1 2CD'],
  ])('%s %j → %j', (cc, raw, expected) => {
    expect(normalizePostcode(cc, raw)).toBe(expected);
  });
});

describe('address components', () => {
  const hit = { street: 'Storgatan', houseNumber: '5', postcode: '34130', locality: 'Ljungby', countryCode: 'se' };

  it('fills a draft from a geocoder hit', () => {
    expect(draftFromComponents(hit)).toEqual({ street: 'Storgatan 5', postcode: '341 30', locality: 'Ljungby', countryCode: 'SE' });
    expect(draftFromComponents({})).toEqual(EMPTY_ADDRESS_DRAFT);
  });

  it('names a place street-first', () => {
    expect(addressPlaceName(hit)).toBe('Storgatan 5, Ljungby');
    expect(addressPlaceName({ street: 'Storgatan' })).toBe('Storgatan');
    expect(addressPlaceName({ houseNumber: '5', locality: 'Ljungby' })).toBeNull();
  });
});

describe('residency rows', () => {
  it('classifies a row', () => {
    expect(residencyRowState({ draft: EMPTY_ADDRESS_DRAFT })).toBe('empty');
    expect(residencyRowState({ draft: { ...EMPTY_ADDRESS_DRAFT, countryCode: 'SE' } })).toBe('empty');
    expect(residencyRowState({ draft: { ...EMPTY_ADDRESS_DRAFT, street: 'Stor' } })).toBe('drafting');
    expect(residencyRowState({ placeId: 'p1', draft: { ...EMPTY_ADDRESS_DRAFT, street: 'Stor' } })).toBe('resolved');
  });

  it('blocks save only while a row is half-typed', () => {
    expect(residencySaveError(['empty', 'resolved'])).toBeNull();
    expect(residencySaveError(['resolved', 'drafting'])).toBe(UNFINISHED_ADDRESS);
  });
});
