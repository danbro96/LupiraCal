/** The one place reach kinds are defined: which are channels (API ReachMedium: Email|Phone) vs social
 *  profiles (open-string service — Telegram et al. live here by design), plus display icons. Once a row
 *  exists its kind is fixed: changing Telegram→Signal in place would silently rewrite what the value means. */

/** `glyph` names a FontAwesome 6 icon; `brand` marks the ones from the brands style (real service
 *  marks, drawn in the service's own color) as opposed to generic solid glyphs. */
export type ReachKind = {
  key: string;
  glyph: string;
  brand?: boolean;
  color: string;
  channelMedium?: 'Email' | 'Phone';
};

export const REACH_KINDS: ReachKind[] = [
  { key: 'Email', glyph: 'envelope', color: '#64748b', channelMedium: 'Email' },
  { key: 'Phone', glyph: 'phone', color: '#64748b', channelMedium: 'Phone' },
  { key: 'Telegram', glyph: 'telegram', brand: true, color: '#26A5E4' },
  { key: 'Signal', glyph: 'signal-messenger', brand: true, color: '#3A76F0' },
  { key: 'WhatsApp', glyph: 'whatsapp', brand: true, color: '#25D366' },
  { key: 'Web', glyph: 'globe', color: '#64748b' },
  { key: 'Other', glyph: 'link', color: '#64748b' },
];

const FALLBACK_GLYPH = { name: 'link', color: '#64748b', brand: false };

/** Icon spec for any reach kind — service names arrive as free strings from the API, so match loosely. */
export function reachGlyph(key: string | null | undefined): { name: string; color: string; brand: boolean } {
  if (!key) return FALLBACK_GLYPH;
  const exact = REACH_KINDS.find((k) => k.key.toLowerCase() === key.toLowerCase());
  return exact ? { name: exact.glyph, color: exact.color, brand: exact.brand === true } : FALLBACK_GLYPH;
}
