import { withAlpha } from '@danbro96/lupira-tokens-core/color';
import { TENTATIVE } from '@lupira/cal-tokens/color';
import type { GridEntry } from '../entries';

export const isTentative = (e: GridEntry) => e.status === 'Tentative';

export const tentativeFill = (color: string) => withAlpha(color, TENTATIVE.fill);

/** For a filled mark: the outline replaces the fill, so the label takes the theme's text colour. */
export const tentativeSx = (color: string) => ({
  border: `${TENTATIVE.borderWidth}px ${TENTATIVE.borderStyle} ${color}`,
  color: 'text.primary',
});
