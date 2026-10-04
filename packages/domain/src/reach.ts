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

/** The reach kinds both editors offer. Channels are the API's ReachMedium; profiles are an open-string service
 *  on the API, so the known ones are listed and anything else reads as Other. A row's kind is fixed once it
 *  exists — changing Telegram→Signal in place would silently rewrite what the value means. */
export const CHANNEL_MEDIUMS = ['Email', 'Phone'] as const;
export const PROFILE_SERVICES = ['Telegram', 'Signal', 'WhatsApp', 'Web', 'Other'] as const;
/** A channel's optional type; null = untyped. */
export const CHANNEL_TYPES = ['Home', 'Work', 'Mobile'] as const;

/** A channel's label: "Phone (Mobile)", or just the medium when it has no type. */
export function channelLabel(medium: string, type: string | null | undefined): string {
  return type ? `${medium} (${type})` : medium;
}
