/** The swatches an item can be drawn in instead of its calendar's colour, in picker order. */
export const ITEM_COLORS = {
  Red: '#dc2626',
  Orange: '#ea580c',
  Yellow: '#ca8a04',
  Green: '#16a34a',
  Teal: '#0d9488',
  Blue: '#2563eb',
  Indigo: '#4f46e5',
  Purple: '#9333ea',
  Pink: '#db2777',
  Brown: '#92400e',
  Graphite: '#475569',
} as const;

export type ItemColorName = keyof typeof ITEM_COLORS;

export const isItemColor = (color: string | null | undefined): color is ItemColorName =>
  color != null && Object.hasOwn(ITEM_COLORS, color);

/** An item's own colour, else its calendar's; a name this build doesn't know falls back too. */
export function itemColor(color: string | null | undefined, calendarFill: string): string {
  return isItemColor(color) ? ITEM_COLORS[color] : calendarFill;
}
