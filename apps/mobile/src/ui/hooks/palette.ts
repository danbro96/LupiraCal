import { AVAILABILITY_COLORS, avatarColor, availabilityColor, calendarColor } from '@danbro96/lupira-tokens-calendar/kinds';
import type { ItemColor } from '@lupira/cal-api/models';
import { ITEM_COLORS as TOKEN_ITEM_COLORS, itemColor } from '@lupira/cal-tokens/itemColors';
import { useCalendars } from '../../state/useContainers';

export { AVAILABILITY_COLORS, availabilityColor, avatarColor };

// Typed against the generated enum: a colour the API adds that tokens don't know stops compiling.
export const ITEM_COLORS: Record<ItemColor, string> = TOKEN_ITEM_COLORS;

/** Colour for a grid row: the item's own when it has one, else its calendar's (the shared calendarColor rule), and
 *  for a birthday — which the mirror synthesizes with no calendar — the Birthdays calendar's, as the web draws it. */
export function useCalendarColors(): (calendarId: string | null, source?: string, color?: string | null) => string {
  const { data } = useCalendars();
  const byId = new Map((data ?? []).map((c) => [c.id, c] as const));
  const birthdays = (data ?? []).find((c) => c.kind === 'Birthdays') ?? { kind: 'Birthdays' };
  return (calendarId, source, color) =>
    itemColor(color, calendarColor(source === 'birthday' ? birthdays : calendarId ? byId.get(calendarId) : null));
}
