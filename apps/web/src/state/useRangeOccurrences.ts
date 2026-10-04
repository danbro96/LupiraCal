import { useSearchItems } from '@lupira/cal-api/query/cal';
import type { CalendarItemOccurrenceDto, ContainerDto } from '@lupira/cal-api/models';

export interface CalendarOccurrences {
  calendar: ContainerDto;
  occurrences: CalendarItemOccurrenceDto[];
}

/**
 * Occurrences per calendar for a window, from one query grouped by `calendarIds` — the DTO carries
 * the accepted memberships, so a query per visible calendar was one request per calendar (eight, on
 * this estate) for data a single call already returns. Toggling a calendar on is now free.
 */
export function useRangeOccurrences(
  calendars: ContainerDto[],
  from: string,
  to: string,
  filters?: { query?: string; tag?: string },
): { byCalendar: CalendarOccurrences[]; isLoading: boolean } {
  const { data, isLoading } = useSearchItems(
    { from, to, query: filters?.query, tag: filters?.tag },
    { query: { enabled: calendars.length > 0 } },
  );

  const byCalendar = calendars.map((calendar) => ({
    calendar,
    occurrences: (data ?? []).filter((o) => o.calendarIds.includes(calendar.id)),
  }));

  return { byCalendar, isLoading: calendars.length > 0 && isLoading };
}
