import { useColors as usePalette } from '@danbro96/lupira-expo-paper/theme/useColors';
import type { Palette } from '@lupira/cal-tokens/color';

/** The active palette, read off the Paper theme PaperProvider is actually holding.
 *  Deriving it from useColorScheme() again would be a second source that can disagree. */
export const useColors = (): Palette => usePalette<Palette>();
