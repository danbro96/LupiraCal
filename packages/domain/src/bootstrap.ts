/** Shares can precede a first login, so the signal is a missing Personal calendar. Bootstrap is idempotent. */
export function needsCalendarBootstrap(calendars: readonly { kind?: string | null }[]): boolean {
  return !calendars.some((c) => c.kind === 'Personal');
}

/** contact-api seeds by slug, so a missing `personal` book is the signal. */
export function needsAddressBookBootstrap(addressBooks: readonly { slug: string }[]): boolean {
  return !addressBooks.some((b) => b.slug === 'personal');
}
