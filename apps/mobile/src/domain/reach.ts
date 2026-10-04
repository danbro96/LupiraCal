import { KIND_COLORS } from '@danbro96/lupira-tokens-calendar/kinds';
import { CHANNEL_MEDIUMS, PROFILE_SERVICES } from '@lupira/cal-domain/reach';

/** Service marks drawn in the service's own colour; everything else in the neutral generic tone. */
const REACH_COLORS: Record<string, string> = {
  Telegram: '#26A5E4',
  Signal: '#3A76F0',
  WhatsApp: '#25D366',
};

function reachColor(kind: string | null | undefined): string {
  const key = Object.keys(REACH_COLORS).find((k) => k.toLowerCase() === kind?.toLowerCase());
  return key ? REACH_COLORS[key] : KIND_COLORS.Generic;
}

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
