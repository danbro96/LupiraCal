import { AVAILABILITY_COLORS, avatarColor, availabilityColor, calendarColor } from '@danbro96/lupira-tokens-calendar/kinds';
import { useCalendars } from '../../state/useContainers';

export { AVAILABILITY_COLORS, availabilityColor, avatarColor };

/** Colour for a grid row: its calendar's (the shared calendarColor rule), and for a birthday — which the
 *  mirror synthesizes with no calendar — the Birthdays calendar's, as the web draws it. */
export function useCalendarColors(): (calendarId: string | null, source?: string) => string {
  const { data } = useCalendars();
  const byId = new Map((data ?? []).map((c) => [c.id, c] as const));
  const birthdays = (data ?? []).find((c) => c.kind === 'Birthdays') ?? { kind: 'Birthdays' };
  return (calendarId, source) => calendarColor(source === 'birthday' ? birthdays : calendarId ? byId.get(calendarId) : null);
}
