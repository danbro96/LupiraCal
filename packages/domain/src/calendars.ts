/** Agenda calendars start shown, System ones hidden; a member's choice overrides per calendar. */
export function isCalendarShown(c: { id: string; class?: string | null }, choices: Readonly<Record<string, boolean>>): boolean {
  return choices[c.id] ?? c.class !== 'System';
}

/** The server refuses new or filed items anywhere else. */
export function canWriteCalendar(c: { access?: string | null }): boolean {
  return c.access === 'Owner' || c.access === 'ReadWrite';
}

/** Calendars a user may deliberately put items into: writable, never System-class scaffolding, never the
 *  synthesized Birthdays calendar (the API refuses it), never Availability (its entries have their own form). */
export function isSelectableCalendar(c: { access?: string | null; class?: string | null; kind?: string | null }): boolean {
  return canWriteCalendar(c) && c.class !== 'System' && c.kind !== 'Birthdays' && c.kind !== 'Availability';
}

/** Where a new item starts: the calendars the last one went to (those still selectable), else Personal, else the first. */
export function defaultCalendarIds(selectable: readonly { id: string; kind?: string | null }[], remembered: readonly string[]): string[] {
  const kept = remembered.filter((id) => selectable.some((c) => c.id === id));
  if (kept.length > 0) return kept;
  const fallback = selectable.find((c) => c.kind === 'Personal') ?? selectable[0];
  return fallback ? [fallback.id] : [];
}

export function calendarLabel(c: { id: string; displayName?: string | null; slug?: string | null }): string {
  return c.displayName || c.slug || c.id;
}
