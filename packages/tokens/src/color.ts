import { darkColors as coreDark, lightColors as coreLight, type Palette as CorePalette } from '@danbro96/lupira-tokens-core/color';

export interface Palette extends CorePalette {
  warning: string;
  success: string;
}

export const lightColors: Palette = {
  ...coreLight,
  warning: '#b45309',
  success: '#1f7a4d',
};

export const darkColors: Palette = {
  ...coreDark,
  warning: '#d8b24a',
  success: '#5fd49b',
};

/** How strongly a mark is drawn: cancelled and proposed (ghost) items recede, a former address fades, the
 *  availability band is a tint behind the grid. */
export const EMPHASIS = { cancelled: 0.5, ghost: 0.55, faded: 0.6, availabilityBand: 0.14 } as const;

/** The palette slot an RSVP is drawn in; each app maps the slot to its own theme. */
export type Tone = 'success' | 'danger' | 'warning' | 'muted';
export function rsvpTone(status: string | null | undefined): Tone {
  return status === 'Accepted' ? 'success' : status === 'Declined' ? 'danger' : status === 'Tentative' ? 'warning' : 'muted';
}
