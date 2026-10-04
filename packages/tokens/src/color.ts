export type ColorScheme = {
  bg: string;
  surface: string;
  primary: string;
  onPrimary: string;
  border: string;
  divider: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textDisabled: string;
  danger: string;
  warning: string;
  success: string;
  /** Identity surfaces only — the mark, the splash, theme-color, primaryColor. Never the UI:
   *  a second accent competing with `primary` is exactly what the palette work removed. */
  brand: string;
};

export const LIGHT: ColorScheme = {
  bg: '#ffffff',
  surface: '#f5f6f8',
  primary: '#0d9488',
  onPrimary: '#ffffff',
  border: '#d4d8e0',
  divider: '#e3e6ec',
  text: '#1c2230',
  textMuted: '#6e7686',
  textSubtle: '#8a909c',
  textDisabled: '#9aa0ac',
  danger: '#b3261e',
  warning: '#b45309',
  brand: '#E76F51',
  success: '#1f7a4d',
};

export const DARK: ColorScheme = {
  bg: '#14171c',
  surface: '#1e232b',
  primary: '#2dd4bf',
  onPrimary: '#042f2e',
  border: '#2c333d',
  divider: '#252b33',
  text: '#e6e9ee',
  textMuted: '#9aa3b2',
  textSubtle: '#7c8492',
  textDisabled: '#5b626e',
  danger: '#f2675e',
  warning: '#d8b24a',
  brand: '#E76F51',
  success: '#5fd49b',
};

/** Over photos and behind sheets. The same in both schemes: what lies underneath sets the contrast. */
export const SCRIM = {
  backdrop: 'rgba(0, 0, 0, 0.4)',
  onImage: 'rgba(0, 0, 0, 0.6)',
  onImageHover: 'rgba(0, 0, 0, 0.8)',
  textOnImage: '#ffffff',
} as const;

/** How strongly a mark is drawn: cancelled and proposed (ghost) items recede, a former address fades, the
 *  availability band is a tint behind the grid. */
export const EMPHASIS = { cancelled: 0.5, ghost: 0.55, faded: 0.6, availabilityBand: 0.14 } as const;

/** A '#rrggbb' colour with an alpha, as '#rrggbbaa'. */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex.slice(0, 7)}${Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0')}`;
}

/** The palette slot an RSVP is drawn in; each app maps the slot to its own theme. */
export type Tone = 'success' | 'danger' | 'warning' | 'muted';
export function rsvpTone(status: string | null | undefined): Tone {
  return status === 'Accepted' ? 'success' : status === 'Declined' ? 'danger' : status === 'Tentative' ? 'warning' : 'muted';
}
