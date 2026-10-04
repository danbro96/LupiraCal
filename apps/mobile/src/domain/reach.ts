import { CHANNEL_MEDIUMS, PROFILE_SERVICES } from '@lupira/cal-domain/reach';
import { reachColor } from '@lupira/cal-tokens/reach';

/** The shared reach kinds (`@lupira/cal-domain/reach`) with this app's icons. `glyph` names a FontAwesome 6
 *  icon; `brand` marks the ones from the brands style (real service marks, drawn in the service's own colour)
 *  as opposed to generic solid glyphs. */
export type ReachKind = {
  key: string;
  glyph: string;
  brand?: boolean;
  color: string;
  channelMedium?: 'Email' | 'Phone';
};

const GLYPHS: Record<string, { glyph: string; brand?: boolean }> = {
  Email: { glyph: 'envelope' },
  Phone: { glyph: 'phone' },
  Telegram: { glyph: 'telegram', brand: true },
  Signal: { glyph: 'signal-messenger', brand: true },
  WhatsApp: { glyph: 'whatsapp', brand: true },
  Web: { glyph: 'globe' },
  Other: { glyph: 'link' },
};

export const REACH_KINDS: ReachKind[] = [
  ...CHANNEL_MEDIUMS.map((m) => ({ key: m, ...GLYPHS[m], color: reachColor(m), channelMedium: m })),
  ...PROFILE_SERVICES.map((s) => ({ key: s, ...GLYPHS[s], color: reachColor(s) })),
];

const FALLBACK_GLYPH = { name: 'link', color: reachColor(null), brand: false };

/** Icon spec for any reach kind — service names arrive as free strings from the API, so match loosely. */
export function reachGlyph(key: string | null | undefined): { name: string; color: string; brand: boolean } {
  if (!key) return FALLBACK_GLYPH;
  const exact = REACH_KINDS.find((k) => k.key.toLowerCase() === key.toLowerCase());
  return exact ? { name: exact.glyph, color: exact.color, brand: exact.brand === true } : FALLBACK_GLYPH;
}
