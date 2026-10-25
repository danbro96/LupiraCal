import { describe, expect, it } from 'vitest';
import type { CalendarItemDto, CalendarItemOccurrenceDto, ContainerDto } from '@lupira/cal-api/models';
import { ITEM_COLORS } from '@lupira/cal-tokens/itemColors';
import { fromOccurrence, fromProposed } from './entries';

const calendar: ContainerDto = { id: 'cal-1', type: 'calendar', slug: 'family', access: 'Owner', color: '#123456' };

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

describe('entry colour', () => {
  it('draws an occurrence in its item colour, else its calendar colour', () => {
    expect(fromOccurrence(occurrence({ color: 'Red' }), calendar).color).toBe(ITEM_COLORS.Red);
    expect(fromOccurrence(occurrence({ color: null }), calendar).color).toBe('#123456');
    expect(fromOccurrence(occurrence({}), calendar).color).toBe('#123456');
  });

  it('draws a proposed item in its item colour, else its calendar colour', () => {
    const item = { id: 'item-2', title: 'Offer', isAllDay: false, startsAt: '2026-07-13T09:00:00+00:00' } as CalendarItemDto;
    expect(fromProposed({ ...item, color: 'Teal' }, calendar)?.color).toBe(ITEM_COLORS.Teal);
    expect(fromProposed(item, calendar)?.color).toBe('#123456');
  });
});
