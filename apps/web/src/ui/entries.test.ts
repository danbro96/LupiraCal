import { describe, expect, it } from 'vitest';
import type { CalendarItemOccurrenceDto, ContainerDto } from '@lupira/cal-api/models';
import { fromOccurrence } from './entries';

const calendar: ContainerDto = { id: 'cal-1', type: 'calendar', slug: 'family', access: 'Owner' };

const occurrence = (o: Partial<CalendarItemOccurrenceDto>): CalendarItemOccurrenceDto => ({
  id: 'item-1',
  title: 'Class',
  isAllDay: false,
  start: '2026-07-13T09:00:00+00:00',
  end: '2026-07-13T11:00:00+00:00',
  isChanged: false,
  calendarIds: ['cal-1'],
  childCount: 0,
  etag: 'e1',
  ...o,
});

describe('fromOccurrence', () => {
  it('carries the occurrence identity as an occurrence key', () => {
    const entry = fromOccurrence(occurrence({ originalStart: '2026-07-13T09:00:00+00:00', start: '2026-07-13T10:00:00+00:00', isChanged: true }), calendar);
    expect(entry.originalStart).toBe('2026-07-13T09:00:00Z');
    expect(entry.start).toEqual(new Date('2026-07-13T10:00:00Z'));
  });

  it('keys two occurrences moved onto one start apart', () => {
    const a = fromOccurrence(occurrence({ originalStart: '2026-07-13T09:00:00+00:00', start: '2026-07-20T09:00:00+00:00' }), calendar);
    const b = fromOccurrence(occurrence({ originalStart: '2026-07-20T09:00:00+00:00', start: '2026-07-20T09:00:00+00:00' }), calendar);
    expect(a.key).not.toBe(b.key);
  });

  it('has no identity for an item that does not recur', () => {
    expect(fromOccurrence(occurrence({}), calendar).originalStart).toBeNull();
  });
});
