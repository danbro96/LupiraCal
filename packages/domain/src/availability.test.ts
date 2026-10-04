import { describe, expect, it } from 'vitest';
import { availabilityEntry } from './availability';

describe('availabilityEntry', () => {
  it('titles the entry by its status and keeps an open end open', () => {
    expect(availabilityEntry({ status: 'Office', startDay: '2026-10-05', endDay: '' })).toEqual({
      ok: true, value: { title: 'Office', isAllDay: true, startDate: '2026-10-05', endDate: null, availability: 'Office' },
    });
  });

  it('needs a status, a start, and an end not before it', () => {
    expect(availabilityEntry({ status: '', startDay: '2026-10-05', endDay: '' })).toEqual({ ok: false, error: 'Pick a status' });
    expect(availabilityEntry({ status: 'Away', startDay: '', endDay: '' })).toEqual({ ok: false, error: 'Pick a start date' });
    expect(availabilityEntry({ status: 'Away', startDay: '2026-10-05', endDay: '2026-10-04' }))
      .toEqual({ ok: false, error: 'End date is before the start date' });
  });
});
