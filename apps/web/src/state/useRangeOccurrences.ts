import { useSearchItems } from '@lupira/cal-api/query/cal';
import { OriginKind, type CalendarItemOccurrenceDto, type ContainerDto } from '@lupira/cal-api/models';
import { displayCalendarId } from '@lupira/cal-domain/calendars';

export interface PlacedOccurrence {
  occurrence: CalendarItemOccurrenceDto;
  calendar: ContainerDto;
}

/**
 * Occurrences in the given calendars for a window, from one query over the DTO's `calendarIds`. An item
 * filed into several of them draws once, under the calendar `displayCalendarId` picks.
 */
export function useRangeOccurrences(
  calendars: ContainerDto[],
  from: string,
  to: string,
  filters?: { query?: string; tag?: string; hiddenSubscriptionIds?: ReadonlySet<string> },
): { occurrences: PlacedOccurrence[]; isLoading: boolean } {
  const { data, isLoading } = useSearchItems(
    { from, to, query: filters?.query, tag: filters?.tag },
    { query: { enabled: calendars.length > 0 } },
  );

  const hidden = filters?.hiddenSubscriptionIds;
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const occurrences = (data ?? []).flatMap((occurrence) => {
    if (occurrence.origin?.kind === OriginKind.Subscription && hidden?.has(occurrence.origin.sourceId)) return [];
    const id = displayCalendarId(occurrence.calendarIds, (c) => byId.has(c));
    return id ? [{ occurrence, calendar: byId.get(id)! }] : [];
  });

  return { occurrences, isLoading: calendars.length > 0 && isLoading };
}
