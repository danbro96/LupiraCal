import { describe, expect, it } from 'vitest';
import { addressMeta, otherResidentsLine, residentsByPlace, residentsLine } from './residents';

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

