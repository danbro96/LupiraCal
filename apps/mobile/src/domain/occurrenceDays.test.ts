import { describe, expect, it } from 'vitest';
import { isMultiDayTimed, lastDayOf } from './occurrenceDays';

const timed = (start: Date, end: Date | null) => ({
  start_utc: start.toISOString(), start_day: '2026-09-28', end_utc: end?.toISOString() ?? null, all_day: 0,
});

describe('lastDayOf', () => {
  it('reads an all-day end date as inclusive', () => {
    expect(lastDayOf({ start_utc: '2026-09-28T00:00:00.000Z', start_day: '2026-09-28', end_utc: '2026-09-30T00:00:00.000Z', all_day: 1 }))
      .toBe('2026-09-30');
  });

  it('keeps open-ended and single-day rows on their start day', () => {
    expect(lastDayOf({ start_utc: '2026-09-28T00:00:00.000Z', start_day: '2026-09-28', end_utc: null, all_day: 1 })).toBe('2026-09-28');
    expect(lastDayOf(timed(new Date(2026, 8, 28, 9), new Date(2026, 8, 28, 10)))).toBe('2026-09-28');
  });

  it('does not spill a timed event that ends at midnight into the next day', () => {
    expect(lastDayOf(timed(new Date(2026, 8, 28, 20), new Date(2026, 8, 29, 0)))).toBe('2026-09-28');
    expect(lastDayOf(timed(new Date(2026, 8, 28, 22), new Date(2026, 8, 29, 2)))).toBe('2026-09-29');
  });
});

describe('isMultiDayTimed', () => {
  it('is true from 24 hours up, and never for all-day rows', () => {
    expect(isMultiDayTimed(timed(new Date(2026, 8, 28, 9), new Date(2026, 8, 29, 9)))).toBe(true);
    expect(isMultiDayTimed(timed(new Date(2026, 8, 28, 22), new Date(2026, 8, 29, 2)))).toBe(false);
    expect(isMultiDayTimed(timed(new Date(2026, 8, 28, 9), null))).toBe(false);
    expect(isMultiDayTimed({ start_utc: '2026-09-28T00:00:00.000Z', start_day: '2026-09-28', end_utc: '2026-10-01T00:00:00.000Z', all_day: 1 }))
      .toBe(false);
  });
});
