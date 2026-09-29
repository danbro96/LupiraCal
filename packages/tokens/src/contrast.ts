import { LIGHT } from './color';

const WHITE = '#ffffff';
// MUI's default contrastThreshold: white wins whenever it clears 3:1, so the saturated calendar hues
// keep white labels and only light ones (yellows, pastels) switch to dark text.
const WHITE_MIN_CONTRAST = 3;

/** Label colour for text drawn on a filled `background` chip: white, or the light scheme's text. */
export function textOn(background: string): string {
  const bg = luminance(background);
  if (bg === null) return WHITE;
  return 1.05 / (bg + 0.05) >= WHITE_MIN_CONTRAST ? WHITE : LIGHT.text;
}

/** WCAG relative luminance of #rgb / #rgba / #rrggbb / #rrggbbaa (alpha ignored); null if unparseable. */
function luminance(color: string): number | null {
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim())?.[1];
  if (!hex) return null;
  const digits = hex.length <= 4 ? [...hex.slice(0, 3)].map((d) => d + d) : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)];
  const [r, g, b] = digits.map((d) => {
    const c = parseInt(d, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
