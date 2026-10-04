// Attendee wording both apps use. Keyed on cal-api's ParticipationStatus / ParticipationRole names as
// strings so this stays free of the generated models; consumers re-type against the enums.

import { plural } from '@danbro96/lupira-domain-core/wording';

export const RSVP_LABELS = {
  NeedsAction: 'Invited — no reply yet',
  Accepted: 'Going',
  Declined: 'Not going',
  Tentative: 'Maybe',
  Delegated: 'Delegated',
} as const;

export const ROLE_LABELS = {
  Chair: 'Organiser',
  RequiredParticipant: 'Required',
  OptionalParticipant: 'Optional',
  NonParticipant: 'FYI',
} as const;

export function rsvpLabel(status: string | null | undefined): string {
  return (RSVP_LABELS as Record<string, string>)[status ?? 'NeedsAction'] ?? status ?? '';
}

export function roleLabel(role: string | null | undefined): string {
  return (ROLE_LABELS as Record<string, string>)[role ?? ''] ?? role ?? '';
}

export const NO_ATTENDEES = 'Nobody invited';

const SUMMARY_ORDER: [status: string, label: string][] = [
  ['Accepted', 'going'], ['Tentative', 'maybe'], ['Declined', 'not going'], ['Delegated', 'delegated'], ['NeedsAction', 'no reply'],
];

/** "4 people · 2 going · 1 maybe · 1 no reply" */
export function attendeeSummary(attendees: readonly { status: string }[]): string {
  const counts = new Map<string, number>();
  for (const a of attendees) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
  const replies = SUMMARY_ORDER.filter(([s]) => counts.has(s)).map(([s, label]) => `${counts.get(s)} ${label}`);
  return [plural(attendees.length, 'person', 'people'), ...replies].join(' · ');
}

/** The participation an invite just created — what an on-the-spot RSVP has to name. */
export function participationIdOf(
  item: { attendees: readonly { contactId: string; participationId: string }[] },
  contactId: string,
): string | null {
  return item.attendees.find((a) => a.contactId === contactId)?.participationId || null;
}
