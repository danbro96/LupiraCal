import { isSelectableCalendar, isCalendarShown } from '@lupira/cal-domain/calendars';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getDb } from '../data/db/expoDb';
import { listContainerDocs, type CalendarFilter } from '../data/mirror';
import { usePrefs } from './prefs-store';

/** Container docs from the mirror, keyed ['containers', kind]. */

export type CalendarContainer = {
  id: string;
  slug?: string;
  displayName?: string | null;
  color?: string | null;
  access?: string;
  class?: string | null;
  kind?: string | null;
};

export function selectableCalendars(calendars: CalendarContainer[] | undefined): CalendarContainer[] {
  return (calendars ?? []).filter(isSelectableCalendar);
}

export function useCalendars() {
  return useQuery<CalendarContainer[]>({
    queryKey: ['containers', 'calendars'],
    queryFn: async () => listContainerDocs<CalendarContainer>(await getDb(), 'calendars'),
  });
}

/** The grids' and search's filter; null until the containers load. */
export function useCalendarFilter(): CalendarFilter | null {
  const { data } = useCalendars();
  const choices = usePrefs((p) => p.calendarChoices);
  return useMemo(() => {
    if (!data) return null;
    const shown = data.filter((c) => isCalendarShown(c, choices));
    const birthdays = data.find((c) => c.kind === 'Birthdays');
    return { calendarIds: shown.map((c) => c.id).sort(), birthdays: !birthdays || shown.includes(birthdays) };
  }, [data, choices]);
}
