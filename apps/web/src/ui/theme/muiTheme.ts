import { createLupiraMuiTheme, cssVars } from '@danbro96/lupira-web-mui/theme';
import { PHONE_BREAKPOINT } from '@danbro96/lupira-tokens-core/breakpoints';
import { darkColors, lightColors } from '@lupira/cal-tokens/color';
import { CATEGORY_COLORS_DARK, CATEGORY_COLORS_LIGHT } from '@lupira/cal-tokens/contactCategories';

export const theme = createLupiraMuiTheme({ light: lightColors, dark: darkColors }, {
  // Domain palette with no MUI slot; @theme re-exports these as Tailwind cat-* utilities.
  rootVars: { light: cssVars(CATEGORY_COLORS_LIGHT, 'cat'), dark: cssVars(CATEGORY_COLORS_DARK, 'cat') },
  breakpoints: {
    // 'md' doubles as the phone breakpoint (down('md') === max-width PHONE_BREAKPOINT.95px);
    // responsive sx values key off it, and useIsPhone wraps the same query.
    values: { xs: 0, sm: 600, md: PHONE_BREAKPOINT + 1, lg: 1200, xl: 1536 },
  },
});
