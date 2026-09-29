/** Deep links for a contact's reach rows, shared so both apps open the same thing. Icons stay per app. */

/** Deep link for a reach entry — a channel's medium or a profile's service, and its value — or null when
 *  the value isn't actionable. */
export function reachLink(kind: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  switch (kind.toLowerCase()) {
    case 'email': return `mailto:${v}`;
    case 'phone': return `tel:${v}`;
    case 'telegram': return `https://t.me/${v.replace(/^@/, '')}`;
    case 'signal': return `https://signal.me/#p/${v}`;
    case 'whatsapp': return `https://wa.me/${v.replace(/[^0-9]/g, '')}`;
    case 'web': return /^https?:\/\//i.test(v) ? v : `https://${v}`;
    default: return /^https?:\/\//i.test(v) ? v : null;
  }
}

/** A channel's label: "Phone (Mobile)", or just the medium when it has no type. */
export function channelLabel(medium: string, type: string | null | undefined): string {
  return type ? `${medium} (${type})` : medium;
}
