/** Agenda calendars start shown, System ones hidden; a member's choice overrides per calendar. */
export function isCalendarShown(c: { id: string; class?: string | null }, choices: Readonly<Record<string, boolean>>): boolean {
  return choices[c.id] ?? c.class !== 'System';
}

/** The server refuses new or filed items anywhere else. */
export function canWriteCalendar(c: { access?: string | null }): boolean {
  return c.access === 'Owner' || c.access === 'ReadWrite';
}
