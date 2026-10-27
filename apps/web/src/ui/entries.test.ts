import { describe, expect, it } from 'vitest';
import type { CalendarItemDto, CalendarItemOccurrenceDto, ContainerDto } from '@lupira/cal-api/models';
import { ITEM_COLORS } from '@lupira/cal-tokens/itemColors';
import { fromOccurrence, fromProposed, isHoliday, isSubscribed } from './entries';

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

describe('subscribed entries', () => {
  const subscribed = occurrence({ origin: { kind: 'Subscription', sourceId: 'sub-1' } });

  it('marks a feed event with the subscribed glyph', () => {
    const entry = fromOccurrence(subscribed, calendar);
    expect(isSubscribed(entry)).toBe(true);
    expect(entry.icon).toBe('subscribed');
    expect(entry.subscription).toEqual({ calendarId: 'cal-1', subscriptionId: 'sub-1' });
  });

  it('leaves birthdays and stored items alone', () => {
    expect(isSubscribed(fromOccurrence(occurrence({ origin: { kind: 'Birthday', sourceId: 'c-1' } }), calendar))).toBe(false);
    const plain = fromOccurrence(occurrence({}), calendar);
    expect(isSubscribed(plain)).toBe(false);
    expect(plain.icon).toBeUndefined();
  });

  it('draws in the subscription colour, else the calendar colour', () => {
    expect(fromOccurrence({ ...subscribed, color: 'Green' }, calendar).color).toBe(ITEM_COLORS.Green);
    expect(fromOccurrence(subscribed, calendar).color).toBe('#123456');
  });
});

describe('holiday entries', () => {
  const midsommar = occurrence({ title: 'Midsommardagen', isAllDay: true, origin: { kind: 'Holiday', sourceId: 'h-1' }, holiday: 'PublicHoliday' });

  it('carries the holiday kind and the holidays glyph', () => {
    const entry = fromOccurrence(midsommar, calendar);
    expect(isHoliday(entry)).toBe(true);
    expect(entry.holiday).toBe('PublicHoliday');
    expect(entry.icon).toBe('celebration');
    expect(entry.subscription).toBeUndefined();
  });

  it('leaves stored items unmarked', () => {
    const plain = fromOccurrence(occurrence({}), calendar);
    expect(isHoliday(plain)).toBe(false);
    expect(plain.holiday).toBeUndefined();
  });
});
