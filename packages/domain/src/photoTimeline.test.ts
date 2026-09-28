import { describe, expect, it } from 'vitest';
import { fmtPhotoRange, monthRange, photoTimeline, wholeSpan, yearRange } from './photoTimeline';

describe('photoTimeline', () => {
  const byMonth = { '2024-11': 3, '2025-01': 5, '2025-03': 2, '2024-12': 0 };

  it('groups months under their year, newest first', () => {
    expect(photoTimeline(byMonth, true)).toEqual([
      { year: '2025', count: 7, months: [{ key: '2025-03', count: 2 }, { key: '2025-01', count: 5 }] },
      { year: '2024', count: 3, months: [{ key: '2024-11', count: 3 }] },
    ]);
  });

  it('follows an oldest-first sort', () => {
    expect(photoTimeline(byMonth, false).map((y) => y.year)).toEqual(['2024', '2025']);
    expect(photoTimeline(byMonth, false)[1].months.map((m) => m.key)).toEqual(['2025-01', '2025-03']);
  });

  it('drops empty and malformed buckets', () => {
    expect(photoTimeline({ '2024-12': 0, 'junk': 4 }, true)).toEqual([]);
  });
});

describe('ranges', () => {
  it('covers a whole year', () => {
    expect(yearRange('2024')).toEqual({ from: '2024-01-01', to: '2024-12-31' });
  });

  it('ends a month on its last day, leap years included', () => {
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange('2025-02').to).toBe('2025-02-28');
    expect(monthRange('2025-12').to).toBe('2025-12-31');
  });
});

describe('wholeSpan', () => {
  it('recognises a year and a month', () => {
    expect(wholeSpan('2024-01-01', '2024-12-31')).toEqual({ kind: 'year', year: '2024' });
    expect(wholeSpan('2024-02-01', '2024-02-29')).toEqual({ kind: 'month', key: '2024-02' });
  });

  it('is null for any other range', () => {
    expect(wholeSpan('2024-02-01', '2024-02-28')).toBeNull();
    expect(wholeSpan('2024-08-03', '2024-08-03')).toBeNull();
    expect(wholeSpan('', '')).toBeNull();
  });
});

describe('fmtPhotoRange', () => {
  it('names a whole year by its number', () => {
    expect(fmtPhotoRange('2024-01-01', '2024-12-31')).toBe('2024');
  });

  it('collapses a single day', () => {
    expect(fmtPhotoRange('2024-08-03', '2024-08-03')).toBe(fmtPhotoRange('2024-08-03'));
  });
});
