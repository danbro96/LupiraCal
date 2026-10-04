import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getGetItemQueryOptions, useSearchItems } from '@lupira/cal-api/query/cal';
import type { AvailabilityStatus, ContainerDto } from '@lupira/cal-api/models';

export interface AvailabilitySegment {
  start: string;
  end?: string | null;
  isAllDay: boolean;
  status: AvailabilityStatus;
}

/**
 * The availability band: occurrences from the Availability-kind calendar, joined with each unique
 * item's detail (the thin occurrence DTO doesn't carry the segment's status). Recurring segments
 * share one item id, so the detail fan-out stays small and cached.
 */
export function useAvailabilitySegments(
  availabilityCalendar: ContainerDto | undefined,
  from: string,
  to: string,
): AvailabilitySegment[] {
  const occurrences = useSearchItems(
    { calendarId: availabilityCalendar?.id, from, to },
    { query: { enabled: !!availabilityCalendar } },
  );

  const ids = useMemo(() => [...new Set((occurrences.data ?? []).map((o) => o.id))], [occurrences.data]);
  const details = useQueries({ queries: ids.map((id) => getGetItemQueryOptions(id)) });

  const statusById = new Map<string, AvailabilityStatus>();
  details.forEach((d, i) => {
    const status = d.data?.details?.presence?.status;
    if (status) statusById.set(ids[i], status);
  });
  return (occurrences.data ?? []).flatMap((o) => {
    const status = statusById.get(o.id);
    return status ? [{ start: o.start, end: o.end, isAllDay: o.isAllDay, status }] : [];
  });
}
