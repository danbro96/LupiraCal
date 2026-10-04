import { KIND_COLORS } from '@danbro96/lupira-tokens-calendar/kinds';

/** Service marks drawn in the service's own colour; everything else in the neutral generic tone. */
export const REACH_COLORS: Record<string, string> = {
  Telegram: '#26A5E4',
  Signal: '#3A76F0',
  WhatsApp: '#25D366',
};

export function reachColor(kind: string | null | undefined): string {
  const key = Object.keys(REACH_COLORS).find((k) => k.toLowerCase() === kind?.toLowerCase());
  return key ? REACH_COLORS[key] : KIND_COLORS.Generic;
}
