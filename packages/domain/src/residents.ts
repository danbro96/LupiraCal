// Who lives at a place, from contacts' addresses. Only a current address makes someone a resident; a former or
// future one is kept apart so callers can show it muted and rank it last.

import { fmtFuzzyDate, fmtResidencyPeriod, residencyStatus, type FuzzyDate, type ResidencyStatus } from './fuzzyDate';

export interface ContactAddressRow {
  contactId: string;
  displayName: string;
  placeId: string;
  addressType?: string | null;
  movedIn?: FuzzyDate | null;
  movedOut?: FuzzyDate | null;
}

export interface Resident extends ContactAddressRow {
  status: ResidencyStatus;
}

export interface PlaceResidents {
  active: Resident[];
  /** Former and future residents. */
  other: Resident[];
}

export function withResidency<T extends Pick<ContactAddressRow, 'movedIn' | 'movedOut'>>(row: T, today: Date = new Date()): T & { status: ResidencyStatus } {
  return { ...row, status: residencyStatus(row.movedIn, row.movedOut, today) };
}

export function residentsByPlace(rows: readonly ContactAddressRow[], today: Date = new Date()): Map<string, PlaceResidents> {
  const byPlace = new Map<string, PlaceResidents>();
  for (const row of rows) {
    const resident = withResidency(row, today);
    const entry = byPlace.get(row.placeId) ?? { active: [], other: [] };
    const bucket = resident.status === 'active' ? entry.active : entry.other;
    if (!bucket.some((r) => r.contactId === row.contactId)) bucket.push(resident);
    byPlace.set(row.placeId, entry);
  }
  return byPlace;
}

const joinNames = (names: readonly string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;

/** "Anna lives here" / "Anna and Erik live here"; null when nobody does. */
export function residentsLine(residents: PlaceResidents | undefined): string | null {
  const names = residents?.active.map((r) => r.displayName) ?? [];
  if (names.length === 0) return null;
  return `${joinNames(names)} ${names.length === 1 ? 'lives' : 'live'} here`;
}

/** "Anna lived here 2010–2015" / "Anna moves in Jun 2027" — for places with no current resident. */
export function otherResidentsLine(residents: PlaceResidents | undefined): string | null {
  const first = residents?.other[0];
  if (!first || residents.active.length > 0) return null;
  const more = residents.other.length > 1 ? ` +${residents.other.length - 1}` : '';
  return `${first.displayName}${more} ${residencyPhrase(first)}`;
}

/** "lived here 2010–2015", "moves in Jun 2027", or "" for a current address. */
export function residencyPhrase(r: Pick<Resident, 'status' | 'movedIn' | 'movedOut'>): string {
  if (r.status === 'future') return r.movedIn ? `moves in ${fmtFuzzyDate(r.movedIn)}` : 'moving in';
  if (r.status === 'former') return `lived here ${fmtResidencyPeriod(r.movedIn, r.movedOut)}`;
  return '';
}
