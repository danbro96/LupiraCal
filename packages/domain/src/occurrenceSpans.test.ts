import { describe, expect, it } from 'vitest';
import { inAllDayStrip, lastDayOf } from './occurrences';

const timedLast = (_start: Date, end: Date | null) => lastDayOf('2026-09-28', end?.toISOString() ?? null, false);
const strip = (start: Date, end: Date | null, isAllDay = false) => inAllDayStrip({ isAllDay, start, end });

describe('lastDayOf', () => {
  it('reads an all-day end date as inclusive', () => {
    expect(lastDayOf('2026-09-28', '2026-09-30T00:00:00.000Z', true)).toBe('2026-09-30');
  });

  it('keeps open-ended and single-day rows on their start day', () => {
    expect(lastDayOf('2026-09-28', null, true)).toBe('2026-09-28');
    expect(timedLast(new Date(2026, 8, 28, 9), new Date(2026, 8, 28, 10))).toBe('2026-09-28');
    expect(lastDayOf('2026-09-28', '2026-09-27T00:00:00.000Z', true)).toBe('2026-09-28');
  });

  it('does not spill a timed event that ends at midnight into the next day', () => {
    expect(timedLast(new Date(2026, 8, 28, 20), new Date(2026, 8, 29, 0))).toBe('2026-09-28');
    expect(timedLast(new Date(2026, 8, 28, 22), new Date(2026, 8, 29, 2))).toBe('2026-09-29');
  });
});

describe('inAllDayStrip', () => {
  it('takes all-day occurrences and timed ones from 24 hours up', () => {
    expect(strip(new Date(2026, 8, 28, 9), new Date(2026, 8, 29, 9))).toBe(true);
    expect(strip(new Date(2026, 8, 28, 22), new Date(2026, 8, 29, 2))).toBe(false);
    expect(strip(new Date(2026, 8, 28, 9), null)).toBe(false);
    expect(strip(new Date(2026, 8, 28), null, true)).toBe(true);
  });

  it('leaves a long parent in the lanes where the grid draws its rail', () => {
    expect(inAllDayStrip({ isAllDay: false, start: new Date(2026, 8, 28, 9), end: new Date(2026, 8, 30, 9) }, true)).toBe(false);
  });
});
