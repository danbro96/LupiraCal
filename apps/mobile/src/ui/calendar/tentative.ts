import { withAlpha } from '@danbro96/lupira-tokens-core/color';
import { TENTATIVE } from '@lupira/cal-tokens/color';
import type { ViewStyle } from 'react-native';

export const isTentative = (status: string | null | undefined) => status === 'Tentative';

/** Uniform width and colour on every side: Android fills an uneven rounded border solid, dropping the dash. */
export const tentativeStyle = (color: string): ViewStyle => ({
  backgroundColor: withAlpha(color, TENTATIVE.fill),
  borderColor: color,
  borderStyle: TENTATIVE.borderStyle,
  borderWidth: TENTATIVE.borderWidth,
});
