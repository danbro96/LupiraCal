import { describe, expect, it } from 'vitest';
import { addressMeta, addressTypeLabel, otherResidentsLine, parentsHomes, residentsByPlace, residentsLine } from './residents';

const today = new Date(2026, 8, 30);

describe('residentsByPlace', () => {
  const rows = [
    { contactId: 'anna', displayName: 'Anna', placeId: 'home' },
    { contactId: 'erik', displayName: 'Erik', placeId: 'home', movedIn: { year: 2020 } },
    { contactId: 'bo', displayName: 'Bo', placeId: 'home', movedOut: { year: 2019 } },
    { contactId: 'cia', displayName: 'Cia', placeId: 'flat', movedIn: { year: 2027, month: 6 } },
    { contactId: 'dag', displayName: 'Dag', placeId: 'old', movedIn: { year: 2010 }, movedOut: { year: 2015 } },
  ];
  const byPlace = residentsByPlace(rows, today);

  it('only current addresses make someone a resident', () => {
    expect(byPlace.get('home')?.active.map((r) => r.contactId)).toEqual(['anna', 'erik']);
    expect(byPlace.get('home')?.other.map((r) => [r.contactId, r.status])).toEqual([['bo', 'former']]);
    expect(byPlace.get('flat')?.other[0].status).toBe('future');
  });

  it('says who lives there', () => {
    expect(residentsLine(byPlace.get('home'))).toBe('Anna and Erik live here');
    expect(residentsLine(byPlace.get('flat'))).toBeNull();
  });

  it('mentions past and future residents only where nobody lives now', () => {
    expect(otherResidentsLine(byPlace.get('home'))).toBeNull();
    expect(otherResidentsLine(byPlace.get('old'))).toBe('Dag lived here 2010–2015');
    expect(otherResidentsLine(byPlace.get('flat'))).toBe('Cia moves in Jun 2027');
  });
});

describe('addressMeta', () => {
  it('names the type and when the residency began or ended', () => {
    expect(addressMeta({ type: 'Home', movedIn: { year: 2019 }, status: 'active' })).toBe('Home · since 2019');
    expect(addressMeta({ type: 'Work', movedIn: { year: 2010 }, movedOut: { year: 2015 }, status: 'former' })).toBe('Work · lived here 2010–2015');
    expect(addressMeta({ movedIn: { year: 2027, month: 6 }, status: 'future' })).toBe('Home · moves in Jun 2027');
  });
});


describe('vacation homes and labels', () => {
  it("names a place nobody lives at but someone holidays at", () => {
    const byPlace = residentsByPlace([
      { contactId: 'anna', displayName: 'Anna', placeId: 'cabin', addressType: 'Vacation' },
      { contactId: 'erik', displayName: 'Erik', placeId: 'cabin', addressType: 'Vacation' },
      { contactId: 'bo', displayName: 'Bo', placeId: 'flat', addressType: 'Home' },
    ], today);
    expect(residentsLine(byPlace.get('cabin'))).toBe("Anna and Erik's vacation home");
    expect(residentsLine(byPlace.get('flat'))).toBe('Bo lives here');
  });

  it('shows the residency label in place of its type', () => {
    expect(addressTypeLabel('Vacation')).toBe('Vacation home');
    expect(addressMeta({ type: 'Vacation', label: 'Summer house', movedIn: { year: 2019 }, status: 'active' })).toBe('Summer house · since 2019');
    expect(addressMeta({ type: 'Vacation', status: 'active' })).toBe('Vacation home');
  });
});

describe('parentsHomes', () => {
  const parents = [{ contactId: 'mum', displayName: 'Mum' }, { contactId: 'dad', displayName: 'Dad' }];

  it("joins parents who live together as the parents' home", () => {
    const homes = parentsHomes('me', parents, [
      { contactId: 'mum', displayName: 'Mum', placeId: 'villa', addressType: 'Home' },
      { contactId: 'dad', displayName: 'Dad', placeId: 'villa', addressType: 'Home' },
      { contactId: 'mum', displayName: 'Mum', placeId: 'cabin', addressType: 'Vacation' },
    ], today);
    expect(homes).toEqual([{ placeId: 'villa', label: "Parents' home", contactIds: ['mum', 'dad'] }]);
  });

  it('names each parent when they live apart, and skips former homes and the one you share', () => {
    const homes = parentsHomes('me', parents, [
      { contactId: 'mum', displayName: 'Mum', placeId: 'flat', addressType: 'Home' },
      { contactId: 'dad', displayName: 'Dad', placeId: 'old', addressType: 'Home', movedOut: { year: 2015 } },
      { contactId: 'dad', displayName: 'Dad', placeId: 'shared', addressType: 'Home' },
      { contactId: 'me', displayName: 'Me', placeId: 'shared', addressType: 'Home' },
    ], today);
    expect(homes).toEqual([{ placeId: 'flat', label: "Mum's home", contactIds: ['mum'] }]);
  });
});
