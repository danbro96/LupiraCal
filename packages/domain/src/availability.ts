// Availability entries: all-day items in the Availability-kind calendar, titled by their status, which the
// grids draw as a background band. Both apps enter them through one short form — status and a day range.

import type { EditResult } from './itemForm';

export interface AvailabilityEntry {
  title: string;
  isAllDay: true;
  startDate: string;
  endDate: string | null;
  availability: string;
}

export function availabilityCalendar<T extends { kind?: string | null }>(calendars: readonly T[] | undefined): T | undefined {
  return calendars?.find((c) => c.kind === 'Availability');
}

/** The entry to create, or what's missing. No status is preselected — a guessed one is wrong more often than not. */
export function availabilityEntry({ status, startDay, endDay }: { status: string; startDay: string; endDay: string }): EditResult<AvailabilityEntry> {
  if (!status) return { ok: false, error: 'Pick a status' };
  if (!startDay) return { ok: false, error: 'Pick a start date' };
  if (endDay && endDay < startDay) return { ok: false, error: 'End date is before the start date' };
  return { ok: true, value: { title: status, isAllDay: true, startDate: startDay, endDate: endDay || null, availability: status } };
}
