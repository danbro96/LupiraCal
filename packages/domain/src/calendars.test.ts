import { describe, expect, it } from 'vitest';
import { canWriteCalendar, displayCalendarId, isCalendarShown } from './calendars';

describe('isCalendarShown', () => {
  it('shows Agenda and hides System until chosen otherwise', () => {
    expect(isCalendarShown({ id: 'a', class: 'Agenda' }, {})).toBe(true);
    expect(isCalendarShown({ id: 's', class: 'System' }, {})).toBe(false);
    expect(isCalendarShown({ id: 'a', class: 'Agenda' }, { a: false })).toBe(false);
    expect(isCalendarShown({ id: 's', class: 'System' }, { s: true })).toBe(true);
  });
});

describe('canWriteCalendar', () => {
  it('allows owners and editors only', () => {
    expect(canWriteCalendar({ access: 'Owner' })).toBe(true);
    expect(canWriteCalendar({ access: 'ReadWrite' })).toBe(true);
    expect(canWriteCalendar({ access: 'Read' })).toBe(false);
    expect(canWriteCalendar({})).toBe(false);
  });
});

describe('displayCalendarId', () => {
  it('picks the lowest-id shown calendar, none when no membership is shown', () => {
    const shown = new Set(['b', 'c']);
    expect(displayCalendarId(['c', 'a', 'b'], (id) => shown.has(id))).toBe('b');
    expect(displayCalendarId(['a'], (id) => shown.has(id))).toBeUndefined();
  });
});
