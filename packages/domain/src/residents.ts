// Who lives at a place, from contacts' residencies. Only a current residency makes someone a resident; a former or
// future one is kept apart so callers can show it muted and rank it last. A vacation home is a residency too, but
// nobody "lives" there.

import { fmtFuzzyDate, fmtResidencyPeriod, residencyStatus, type FuzzyDate, type ResidencyStatus } from './fuzzyDate';

export interface ContactAddressRow {
  contactId: string;
  displayName: string;
  placeId: string;
  addressType?: string | null;
  /** Free-text refinement ("Summer house, Gotland"). */
  label?: string | null;
  movedIn?: FuzzyDate | null;
  movedOut?: FuzzyDate | null;
}

/** How a residency type reads: "Home", "Vacation home", "Work", "Other". */
export function addressTypeLabel(type: string | null | undefined): string {
  return type === 'Vacation' ? 'Vacation home' : (type ?? 'Home');
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

/** "Anna lives here" / "Anna and Erik live here", else "Anna's vacation home"; null when nobody is there now. */
export function residentsLine(residents: PlaceResidents | undefined): string | null {
  const active = residents?.active ?? [];
  const living = active.filter((r) => r.addressType !== 'Vacation').map((r) => r.displayName);
  if (living.length > 0) return `${joinNames(living)} ${living.length === 1 ? 'lives' : 'live'} here`;
  const holidaying = active.map((r) => r.displayName);
  return holidaying.length > 0 ? `${joinNames(holidaying)}'s vacation home` : null;
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

/** A contact's address line: "Home · since 2019", "Work · lived here 2010–2015", "Summer house · moves in Jun 2027".
 *  The residency's own label, when it has one, stands in for the type. */
export function addressMeta(a: {
  type?: string | null; label?: string | null; movedIn?: FuzzyDate | null; movedOut?: FuzzyDate | null; status: ResidencyStatus;
}): string {
  const name = a.label || addressTypeLabel(a.type);
  if (a.status !== 'active') return `${name} · ${residencyPhrase(a)}`;
  return a.movedIn ? `${name} · since ${fmtFuzzyDate(a.movedIn)}` : name;
}

export interface ParentsHome {
  placeId: string;
  /** "Parents' home" when two or more parents live there, else "Anna's home". */
  label: string;
  contactIds: string[];
}

/**
 * Where a contact's parents live now, derived — never stored: each parent's current Home residencies, one entry per
 * place. A place the contact still lives at is just their own home, so it's left out.
 */
export function parentsHomes(
  contactId: string,
  parents: readonly { contactId: string; displayName: string }[],
  residencies: readonly ContactAddressRow[],
  today: Date = new Date(),
): ParentsHome[] {
  const current = residencies.filter((r) => r.addressType === 'Home' && withResidency(r, today).status === 'active');
  const ownHomes = new Set(current.filter((r) => r.contactId === contactId).map((r) => r.placeId));
  const byPlace = new Map<string, { contactId: string; displayName: string }[]>();
  for (const parent of parents) {
    for (const r of current.filter((x) => x.contactId === parent.contactId && !ownHomes.has(x.placeId))) {
      const there = byPlace.get(r.placeId) ?? [];
      if (!there.some((p) => p.contactId === parent.contactId)) there.push(parent);
      byPlace.set(r.placeId, there);
    }
  }
  return [...byPlace].map(([placeId, there]) => ({
    placeId,
    label: there.length > 1 ? "Parents' home" : `${there[0].displayName}'s home`,
    contactIds: there.map((p) => p.contactId),
  }));
}

/** A contact's addresses, current first-class and past/future apart; addresses with no place are dropped. */
export function splitAddresses<T extends { placeId?: string | null; movedIn?: FuzzyDate | null; movedOut?: FuzzyDate | null }>(
  addresses: readonly T[], today: Date = new Date(),
): { current: (T & { status: ResidencyStatus })[]; other: (T & { status: ResidencyStatus })[] } {
  const all = addresses.filter((a) => a.placeId).map((a) => withResidency(a, today));
  return { current: all.filter((a) => a.status === 'active'), other: all.filter((a) => a.status !== 'active') };
}

