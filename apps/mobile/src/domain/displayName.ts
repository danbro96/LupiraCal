import type { ContactDoc } from './docTypes';

/** Server composition mirrored (Contact.DisplayName): format-specific label, falling back to the full
 *  composition, then nickname — never empty for a named contact. */
export function composeDisplayName(d: ContactDoc): string {
  const parts = (xs: (string | null | undefined)[]) => xs.filter((s) => s && s.trim().length > 0).join(' ');
  const full = parts([d.givenName, d.middleName, d.familyName]) || (d.nickname ?? '') || d.id;
  switch (d.displayNameFormat) {
    case 'FirstLast': return parts([d.givenName, d.familyName]) || full;
    case 'NickName': return d.nickname || full;
    default: return full;
  }
}
