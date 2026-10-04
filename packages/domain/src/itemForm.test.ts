import { describe, expect, it } from 'vitest';
import {
  categoryAllDayDefault, defaultStartTime, emptyItemForm, movedEnd, parseList, scheduleFromForm, withAllDay, withSchedule,
} from './itemForm';

describe('slot-created form', () => {
  it('prefills a one-hour window from day + time', () => {
    const form = emptyItemForm('2026-08-03', '14:00');
    expect(form).toMatchObject({ startDay: '2026-08-03', startTime: '14:00', endDay: '2026-08-03', endTime: '15:00' });
  });

  it('rolls the end past midnight', () => {
    const form = emptyItemForm('2026-08-03', '23:30');
    expect(form).toMatchObject({ endDay: '2026-08-04', endTime: '00:30' });
  });
});

describe('categoryAllDayDefault', () => {
  it('day-scoped and timed categories have opinions; others do not', () => {
    expect(categoryAllDayDefault('Occasion')).toBe(true);
    expect(categoryAllDayDefault('Trip')).toBe(true);
    expect(categoryAllDayDefault('Meeting')).toBe(false);
    expect(categoryAllDayDefault('General')).toBeNull();
    expect(categoryAllDayDefault('')).toBeNull();
  });
});

describe('parseList', () => {
  it('trims, drops empties, dedupes case-insensitively', () => {
    expect(parseList(' a, B ,a, ,b')).toEqual(['a', 'B']);
    expect(parseList('')).toEqual([]);
  });
});

describe('FAB-created form', () => {
  it('starts at the next half hour today and 09:00 on any other day', () => {
    const now = new Date(2026, 8, 29, 14, 10);
    expect(defaultStartTime('2026-09-29', now)).toBe('14:30');
    expect(defaultStartTime('2026-09-29', new Date(2026, 8, 29, 14, 30))).toBe('15:00');
    expect(defaultStartTime('2026-10-02', now)).toBe('09:00');
  });

  it('never leaves the picked day', () => {
    expect(defaultStartTime('2026-09-29', new Date(2026, 8, 29, 23, 50))).toBe('23:30');
  });

  it('prefills a one-hour event', () => {
    const form = emptyItemForm('2026-10-02', undefined, new Date(2026, 8, 29, 14, 10));
    expect(form).toMatchObject({ startDay: '2026-10-02', startTime: '09:00', endDay: '2026-10-02', endTime: '10:00' });
  });
});

describe('withSchedule', () => {
  const timed = { ...emptyItemForm(), startDay: '2026-10-02', startTime: '09:00', endDay: '2026-10-02', endTime: '10:30' };

  it('moving the start carries the end, keeping the duration', () => {
    expect(withSchedule(timed, 'startTime', '11:00')).toMatchObject({ endDay: '2026-10-02', endTime: '12:30' });
    expect(withSchedule(timed, 'startDay', '2026-10-05')).toMatchObject({ endDay: '2026-10-05', endTime: '10:30' });
    expect(withSchedule(timed, 'startTime', '23:00')).toMatchObject({ endDay: '2026-10-03', endTime: '00:30' });
  });

  it('picking one end field of an endless event completes the other', () => {
    const endless = { ...timed, endDay: '', endTime: '' };
    expect(withSchedule(endless, 'endDay', '2026-10-03')).toMatchObject({ endDay: '2026-10-03', endTime: '10:00' });
    expect(withSchedule(endless, 'endTime', '11:00')).toMatchObject({ endDay: '2026-10-02', endTime: '11:00' });
    expect(withSchedule(endless, 'endTime', '01:00')).toMatchObject({ endDay: '2026-10-03', endTime: '01:00' });
  });

  it('moving the end leaves the start alone', () => {
    expect(withSchedule(timed, 'endTime', '17:00')).toMatchObject({ startTime: '09:00', endTime: '17:00' });
  });

  it('completing a start on an endless event gives it an hour', () => {
    const dayOnly = { ...emptyItemForm(), startDay: '2026-10-02' };
    expect(withSchedule(dayOnly, 'startTime', '18:00')).toMatchObject({ endDay: '2026-10-02', endTime: '19:00' });
  });

  it('shifts an all-day range by whole days', () => {
    const range = { ...emptyItemForm(), isAllDay: true, startDay: '2026-10-02', endDay: '2026-10-04' };
    expect(withSchedule(range, 'startDay', '2026-10-30')).toMatchObject({ endDay: '2026-11-01' });
  });
});

describe('withAllDay', () => {
  it('turns a span past midnight into a multi-day range', () => {
    const overnight = { ...emptyItemForm(), startDay: '2026-10-02', startTime: '20:00', endDay: '2026-10-04', endTime: '10:00' };
    expect(withAllDay(overnight, true)).toMatchObject({ isAllDay: true, startTime: '', endTime: '', endDay: '2026-10-04' });
  });

  it('an end at midnight closes the previous day', () => {
    const evening = { ...emptyItemForm(), startDay: '2026-10-02', startTime: '20:00', endDay: '2026-10-03', endTime: '00:00' };
    expect(withAllDay(evening, true)).toMatchObject({ endDay: '' });
  });

  it('a range turned timed starts at 09:00 for an hour', () => {
    const range = { ...emptyItemForm(), isAllDay: true, startDay: '2026-10-02', endDay: '2026-10-04' };
    expect(withAllDay(range, false)).toMatchObject({ startTime: '09:00', endDay: '2026-10-02', endTime: '10:00' });
  });
});

describe('scheduleFromForm', () => {
  it('refuses an end that is not after the start, and recurrence without a start', () => {
    const base = { ...emptyItemForm(), timeZone: '' };
    expect(scheduleFromForm({ ...base, startDay: '2026-10-02', startTime: '10:00', endDay: '2026-10-02', endTime: '09:00' }))
      .toEqual({ ok: false, error: 'End is not after the start' });
    expect(scheduleFromForm({ ...base, recurrenceRule: 'FREQ=WEEKLY' })).toEqual({ ok: false, error: 'Recurrence needs a start' });
  });

  it('turns an all-day range into its stored dates', () => {
    const r = scheduleFromForm({ ...emptyItemForm(), isAllDay: true, startDay: '2026-10-02', endDay: '2026-10-04' });
    expect(r).toMatchObject({ ok: true, value: { startDate: '2026-10-02', endDate: '2026-10-04', startsAt: null, startTimezone: null } });
  });
});

describe('movedEnd', () => {
  it('keeps the duration on the event zone clock across a DST change', () => {
    // Stockholm leaves summer time on 2026-10-25: 09:00–10:00 the day before, moved a day on, still ends 10:00.
    const end = movedEnd('2026-10-24T07:00:00.000Z', '2026-10-24T08:00:00.000Z', '2026-10-25T08:00:00.000Z', 'Europe/Stockholm');
    expect(end).toBe('2026-10-25T09:00:00.000Z');
  });
});
