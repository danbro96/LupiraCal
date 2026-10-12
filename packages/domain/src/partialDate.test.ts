import { describe, expect, it } from 'vitest';
import { clampBirthdayDay, daysInMonth, monthNames, withYearKnown, type BirthdayFields } from './partialDate';

const fields = (f: Partial<BirthdayFields>): BirthdayFields => ({ yearKnown: true, date: '', month: '', day: '', ...f });

describe('monthNames', () => {
  it('names twelve months from January', () => {
    const names = monthNames('en');
    expect(names).toHaveLength(12);
    expect(names[0]).toBe('January');
    expect(names[11]).toBe('December');
  });
});

describe('daysInMonth', () => {
  it('allows 29 February when the year is unknown', () => {
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(2, 2023)).toBe(28);
    expect(daysInMonth(4)).toBe(30);
    expect(daysInMonth(12)).toBe(31);
  });
});

describe('clampBirthdayDay', () => {
  it('pulls the day back inside the month', () => {
    expect(clampBirthdayDay('4', '31')).toBe('30');
    expect(clampBirthdayDay('2', '12')).toBe('12');
    expect(clampBirthdayDay('2', '')).toBe('');
  });
});

describe('withYearKnown', () => {
  it('carries the date’s month and day to the pair', () => {
    expect(withYearKnown(fields({ date: '1990-07-07' }), false)).toEqual({ yearKnown: false, date: '1990-07-07', month: '7', day: '7' });
  });

  it('keeps the entered year when the pair changed', () => {
    expect(withYearKnown(fields({ yearKnown: false, date: '1990-07-07', month: '8', day: '1' }), true).date).toBe('1990-08-01');
    expect(withYearKnown(fields({ yearKnown: false, date: '2023-01-01', month: '2', day: '29' }), true).date).toBe('2023-02-28');
  });

  it('invents no year', () => {
    expect(withYearKnown(fields({ yearKnown: false, month: '7', day: '7' }), true)).toEqual({ yearKnown: true, date: '', month: '7', day: '7' });
  });
});
