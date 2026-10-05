import { isSelectableCalendar, isCalendarShown } from '@lupira/cal-domain/calendars';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import type { CalendarFilter } from '../data/queries/calendarFilter';
import { Aggregate } from '../domain/aggregates';
import { engine } from '../sync/engine';
import { usePrefs } from './prefs-store';

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
  return useQuery(mirrorQuery([Aggregate.calendar], async () =>
    (await engine.docs<CalendarContainer, null>(Aggregate.calendar)).map((d) => d.state.doc)));
}

/** The grids' and search's filter; null until the calendars load. */
export function useCalendarFilter(): CalendarFilter | null {
  const { data } = useCalendars();
  const choices = usePrefs((p) => p.calendarChoices);
  if (!data) return null;
  const shown = data.filter((c) => isCalendarShown(c, choices));
  const birthdays = data.find((c) => c.kind === 'Birthdays');
  return { calendarIds: shown.map((c) => c.id).sort(), birthdays: !birthdays || shown.includes(birthdays) };
}
