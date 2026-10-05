import { describe, expect, it } from 'vitest';
import type { ContactDoc, ItemDoc } from './docTypes';
import { birthdayRows, currentHorizon, horizonDrifted, occurrenceRowsForItem } from './materialize';

const horizon = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-04-01T00:00:00Z') };

const item = (over: Partial<ItemDoc>): ItemDoc => ({
  id: 'item-1', isAllDay: false, calendars: [{ calendarId: 'cal-1', status: 'Accepted' }], ...over,
});

describe('occurrenceRowsForItem', () => {
  it('materializes a weekly rule across the horizon with preserved duration', () => {
    const rows = occurrenceRowsForItem(item({
      startsAt: '2026-01-05T09:00:00Z', endsAt: '2026-01-05T10:00:00Z', recurrenceRule: 'FREQ=WEEKLY',
    }), horizon);
    expect(rows.length).toBe(13);   // 5 Jan … 30 Mar, every Monday
    expect(rows[1].startUtc).toBe('2026-01-12T09:00:00.000Z');
    expect(rows[1].endUtc).toBe('2026-01-12T10:00:00.000Z');
  });

  it('degrades an unsupported rule to the anchor occurrence instead of vanishing', () => {
    const rows = occurrenceRowsForItem(item({
      startsAt: '2026-01-05T09:00:00Z', recurrenceRule: 'FREQ=HOURLY',
    }), horizon);
    expect(rows).toHaveLength(1);
  });

  it('gives all-day items their calendar date verbatim as the grid bucket', () => {
    const rows = occurrenceRowsForItem(item({
      isAllDay: true, startDate: '2026-02-14', endDate: '2026-02-15',
    }), horizon);
    expect(rows).toHaveLength(1);
    expect(rows[0].startDay).toBe('2026-02-14');
    expect(rows[0].allDay).toBe(true);
  });

  it('produces nothing for startless items', () => {
    expect(occurrenceRowsForItem(item({}), horizon)).toHaveLength(0);
  });
});

describe('birthdayRows', () => {
  const contact = (birthday: ContactDoc['birthday']): ContactDoc => ({ id: 'c1', addressBookId: 'b1', birthday });

  it('synthesizes yearly all-day rows', () => {
    const rows = birthdayRows(contact({ year: 1990, month: 2, day: 14 }), horizon);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'birthday', startDay: '2026-02-14', allDay: true });
  });

  it('skips Feb 29 outside leap years', () => {
    const rows = birthdayRows(contact({ year: null, month: 2, day: 29 }), horizon);
    expect(rows).toHaveLength(0);   // 2026 is not a leap year
    const leap = birthdayRows(contact({ year: null, month: 2, day: 29 }),
      { start: new Date('2028-01-01T00:00:00Z'), end: new Date('2028-06-01T00:00:00Z') });
    expect(leap).toHaveLength(1);
  });
});

describe('horizon', () => {
  it('spans −12/+24 months and detects month-scale drift', () => {
    const h = currentHorizon(new Date('2026-07-28T10:00:00Z'));
    expect(h.start.toISOString()).toBe('2025-07-01T00:00:00.000Z');
    expect(h.end.toISOString()).toBe('2028-08-01T00:00:00.000Z');
    expect(horizonDrifted(h, currentHorizon(new Date('2026-08-05T00:00:00Z')))).toBe(false);
    expect(horizonDrifted(h, currentHorizon(new Date('2026-10-01T00:00:00Z')))).toBe(true);
  });
});
