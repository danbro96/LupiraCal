/** Structural mirrors of the wire DTOs the mirror stores (domain stays generated-code-free; the shapes are
 *  asserted where data-layer code hands DTOs in). Unknown fields ride along untouched — the mirror stores the
 *  full server JSON and only reads/writes the fields the reducers know. */

import type { SectionGuard } from '@danbro96/lupira-sync-core/lww';

export type { SectionGuard };

export type ItemGuards = {
  core: SectionGuard;
  metadata: SectionGuard;
  payload: SectionGuard;
  filing: Record<string, SectionGuard>;
};

export type ContactGuards = {
  core: SectionGuard;
  profiles: SectionGuard;
  avatar: SectionGuard;
  metadata: SectionGuard;
  deceased: SectionGuard;
};

export type CalendarMembership = { calendarId: string; status: string };

/** `participationId` is '' until the server has minted one for an invite still in the outbox. */
export type ItemAttendee = { participationId: string; contactId: string; role: string; status: string };

export type ItemDoc = {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  isAllDay: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTimezone?: string | null;
  endTimezone?: string | null;
  recurrenceRule?: string | null;
  category?: string | null;
  tags?: string[] | null;
  parentItemId?: string | null;
  placeId?: string | null;
  locationLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  calendars: CalendarMembership[];
  attendees?: ItemAttendee[];
  updatedAt?: string;
  [key: string]: unknown;
};

export type ReachChannel = { medium: string; value: string; type?: string | null; preferred: boolean };
export type SocialProfile = { service: string; handle: string; url?: string | null; preferred: boolean };
export type PartialDateDto = { year: number | null; month: number; day: number };

export type FuzzyDateDto = { year: number; month?: number | null; day?: number | null };
/** A contact's residency at a place — current iff today falls between movedIn and movedOut (`@danbro96/lupira-domain-contacts/fuzzyDate`). */
export type ResidencyDoc = {
  id: string;
  contactId: string;
  placeId: string;
  type?: string | null;
  label?: string | null;
  movedIn?: FuzzyDateDto | null;
  movedOut?: FuzzyDateDto | null;
};

/** The door and gate codes at a place. Secret: never logged. */
export type PlaceEntryDoc = { placeId: string; codes: { id: string; label: string; code: string; note?: string | null }[] };

export type ContactDoc = {
  id: string;
  addressBookId: string;
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  nickname?: string | null;
  displayName?: string;
  displayNameFormat?: string | null;
  kind?: string | null;
  channels?: ReachChannel[] | null;
  birthday?: PartialDateDto | null;
  tags?: string[] | null;
  notes?: string | null;
  pronouns?: string | null;
  profiles?: SocialProfile[] | null;
  metadata?: Record<string, unknown> | null;
  updatedAt?: string;
  [key: string]: unknown;
};

export const ZERO_GUARD: SectionGuard = { ts: '0001-01-01T00:00:00+00:00', cmd: '00000000-0000-0000-0000-000000000000' };

export function emptyItemGuards(): ItemGuards {
  return { core: ZERO_GUARD, metadata: ZERO_GUARD, payload: ZERO_GUARD, filing: {} };
}

export function emptyContactGuards(): ContactGuards {
  return {
    core: ZERO_GUARD, profiles: ZERO_GUARD,
    avatar: ZERO_GUARD, metadata: ZERO_GUARD, deceased: ZERO_GUARD,
  };
}
