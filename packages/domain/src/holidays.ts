export function isHolidayOrigin(origin: { kind: string } | null | undefined): boolean {
  return origin?.kind === 'Holiday';
}

/** A public holiday is a red day; an eve is shown but isn't one. */
export function isRedDay(e: { holiday?: string | null }): boolean {
  return e.holiday === 'PublicHoliday';
}
