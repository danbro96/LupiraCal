import { describe, expect, it } from 'vitest';
import { UNFINISHED_ADDRESS } from '@lupira/cal-domain/addressDraft';
import { addressRowsFrom, addressSaveError, hintAddressRow, newAddressRow, residencyChanges, settledHintIds, type AddressRow } from './addressRows';
import type { AddressHint } from './bridgeTranslate';
import type { ResidencyDoc } from './docTypes';

const stored: ResidencyDoc = { id: 'r-1', contactId: 'c-1', placeId: 'p-1', type: 'Home', label: 'Gotland', movedIn: { year: 2020 }, movedOut: null };
const [row] = addressRowsFrom([stored]);

describe('residencyChanges', () => {
  it('asks nothing of an untouched row or an unresolved new one', () => {
    expect(residencyChanges([row, { ...newAddressRow('n'), draft: { street: 'Storgatan 5', postcode: '', locality: '', countryCode: '' } }])).toEqual([]);
  });

  it('starts a resolved new row', () => {
    expect(residencyChanges([{ ...newAddressRow('n'), placeId: 'p-2', type: 'Work' }])).toEqual([
      { kind: 'start', residency: { placeId: 'p-2', type: 'Work', label: null, movedIn: null, movedOut: null } },
    ]);
  });

  it('moves out when only the end date changed', () => {
    const movedOut = { year: 2026, month: 10, day: 12 };
    expect(residencyChanges([{ ...row, movedOut }])).toEqual([{ kind: 'moveOut', residencyId: 'r-1', movedOut }]);
  });

  it('corrects a re-placed or retyped row wholesale and erases a removed one', () => {
    const changes = residencyChanges([{ ...row, placeId: 'p-9' }, { ...row, key: 'x', removed: true }, { ...newAddressRow('y'), placeId: 'p-3', removed: true }]);
    expect(changes).toEqual([
      { kind: 'revise', residencyId: 'r-1', residency: { placeId: 'p-9', type: 'Home', label: 'Gotland', movedIn: { year: 2020 }, movedOut: null } },
      { kind: 'remove', residencyId: 'r-1' },
    ]);
  });
});

describe('addressSaveError', () => {
  const typing: AddressRow = { ...newAddressRow('n'), draft: { street: 'Storgatan', postcode: '', locality: '', countryCode: '' } };

  it('blocks a half-typed address unless it is removed', () => {
    expect(addressSaveError([row, typing])).toBe(UNFINISHED_ADDRESS);
    expect(addressSaveError([row, { ...typing, removed: true }])).toBeNull();
  });
});

describe('address hints', () => {
  const hint = (over: Partial<AddressHint> = {}): AddressHint => ({
    id: 'h1', contactId: 'c-1', residencyId: 'r-1', type: 'Work', text: 'Storgatan 3, 341 30 Ljungby',
    street: 'Storgatan 3', postcode: '34130', city: 'Ljungby', country: 'se', ...over,
  });

  it('a hint opens as a new row typed from its parts', () => {
    expect(hintAddressRow(hint(), 'k')).toMatchObject({
      key: 'k', stored: null, placeId: null, type: 'Work', hintId: 'h1',
      draft: { street: 'Storgatan 3', postcode: '341 30', locality: 'Ljungby', countryCode: 'SE' },
    });
  });

  it('a text-only hint splits street from the rest; a spelled-out country is left to the home default', () => {
    const row = hintAddressRow(hint({ street: null, postcode: null, city: null, country: 'Sverige', type: null }), 'k');
    expect(row).toMatchObject({ type: 'Home', draft: { street: 'Storgatan 3', postcode: '', locality: '341 30 Ljungby', countryCode: '' } });
  });

  it('only rows saved with a place settle their hint', () => {
    const seeded = hintAddressRow(hint(), 'k');
    expect(settledHintIds([seeded, { ...seeded, key: 'a', placeId: 'p-2', hintId: 'h2' }, { ...seeded, placeId: 'p-3', removed: true, hintId: 'h3' }]))
      .toEqual(['h2']);
  });
});
