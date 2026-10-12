import { describe, expect, it } from 'vitest';
import { UNFINISHED_ADDRESS } from '@lupira/cal-domain/addressDraft';
import { addressRowsFrom, addressSaveError, newAddressRow, residencyChanges, type AddressRow } from './addressRows';
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

  it('moves out when only the end date changed, keeping the rest as stated', () => {
    const movedOut = { year: 2026, month: 10, day: 12 };
    expect(residencyChanges([{ ...row, movedOut }])).toEqual([{
      kind: 'moveOut', residencyId: 'r-1', movedOut,
      residency: { placeId: 'p-1', type: 'Home', label: 'Gotland', movedIn: { year: 2020 }, movedOut: null },
    }]);
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
