/** Shares can precede a first login, so the signal is a missing Personal calendar. Bootstrap is idempotent. */
export function needsCalendarBootstrap(calendars: readonly { kind?: string | null }[]): boolean {
  return !calendars.some((c) => c.kind === 'Personal');
}

/** Someone else's shared `personal` book isn't yours, so the server's own-book flag is the signal. */
export function needsAddressBookBootstrap(addressBooks: readonly { isPersonal: boolean }[]): boolean {
  return !addressBooks.some((b) => b.isPersonal);
}
