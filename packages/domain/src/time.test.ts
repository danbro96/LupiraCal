import { describe, expect, it } from 'vitest';
import { addDays, daysFrom, fmtBlockTime, fmtTime, monthMatrix, parseYmd, sameDay, startOfWeek, ymd } from './time';

describe('ymd round-trip', () => {
  it('formats and parses local dates', () => {
    const d = new Date(2026, 6, 7);
    expect(ymd(d)).toBe('2026-07-07');
    expect(sameDay(parseYmd('2026-07-07'), d)).toBe(true);
  });
});

describe('startOfWeek', () => {
  it('is Monday-first', () => {
    // 2026-07-07 is a Tuesday → week starts Monday 2026-07-06.
    expect(ymd(startOfWeek(new Date(2026, 6, 7)))).toBe('2026-07-06');
    // A Monday stays put; a Sunday goes back six days.
    expect(ymd(startOfWeek(new Date(2026, 6, 6)))).toBe('2026-07-06');
    expect(ymd(startOfWeek(new Date(2026, 6, 12)))).toBe('2026-07-06');
  });
});

describe('addDays', () => {
  it('crosses month boundaries', () => {
    expect(ymd(addDays(new Date(2026, 6, 31), 1))).toBe('2026-08-01');
    expect(ymd(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
  });
});

describe('daysFrom', () => {
  it('yields consecutive days from the anchor, crossing months', () => {
    const days = daysFrom(new Date(2026, 6, 30), 3);
    expect(days.map(ymd)).toEqual(['2026-07-30', '2026-07-31', '2026-08-01']);
  });
});

describe('monthMatrix', () => {
  it('covers July 2026 in full Monday-first weeks', () => {
    const weeks = monthMatrix(new Date(2026, 6, 15));
    // July 2026: 1st is a Wednesday, 31st a Friday → grid runs Jun 29 – Aug 2 (5 weeks).
    expect(weeks).toHaveLength(5);
    expect(ymd(weeks[0][0])).toBe('2026-06-29');
    expect(ymd(weeks[4][6])).toBe('2026-08-02');
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it('handles a month starting on Monday', () => {
    // June 2026 starts on a Monday.
    const weeks = monthMatrix(new Date(2026, 5, 1));
    expect(ymd(weeks[0][0])).toBe('2026-06-01');
  });
});

describe('fmtBlockTime', () => {
  const start = new Date(2026, 7, 12, 15, 0);
  const end = new Date(2026, 7, 13, 11, 0);

  it('labels a block by its start on the day it starts', () => {
    expect(fmtBlockTime(start, end, new Date(2026, 7, 12))).toBe(fmtTime(start));
  });

  it('labels the carried-over part by when it ends', () => {
    expect(fmtBlockTime(start, end, new Date(2026, 7, 13))).toBe(`until ${fmtTime(end)}`);
  });
});
