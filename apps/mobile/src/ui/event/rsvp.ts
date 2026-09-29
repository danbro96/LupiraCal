const RSVP_LABELS: Record<string, string> = {
  NeedsAction: 'Invited — no reply yet',
  Accepted: 'Going',
  Declined: 'Not going',
  Tentative: 'Maybe',
  Delegated: 'Delegated',
};

export function rsvpLabel(status: string | undefined): string {
  return RSVP_LABELS[status ?? 'NeedsAction'] ?? status ?? '';
}

const SUMMARY_ORDER: [status: string, label: string][] = [
  ['Accepted', 'going'], ['Tentative', 'maybe'], ['Declined', 'not going'], ['Delegated', 'delegated'], ['NeedsAction', 'no reply'],
];

/** "4 people · 2 going · 1 maybe · 1 no reply" */
export function attendeeSummary(attendees: readonly { status: string }[]): string {
  const counts = new Map<string, number>();
  for (const a of attendees) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
  const replies = SUMMARY_ORDER.filter(([s]) => counts.has(s)).map(([s, label]) => `${counts.get(s)} ${label}`);
  return [`${attendees.length} ${attendees.length === 1 ? 'person' : 'people'}`, ...replies].join(' · ');
}
