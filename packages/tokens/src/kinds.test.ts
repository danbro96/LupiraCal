import { describe, expect, it } from 'vitest';
import { avatarColor, calendarColor, familyAccent, KIND_COLORS } from './kinds.ts';

// The hash outputs are user-visible color assignments persisted nowhere — changing either function
// silently rescrambles every calendar/family color on both platforms. Pin known outputs.
describe('color hashes are stable', () => {
  it('familyAccent', () => {
    expect(familyAccent('a')).toBe('#ca8a04');
    expect(familyAccent('parent-item-id')).toBe('#0284c7');
  });

  it('avatarColor', () => {
    expect(avatarColor('a')).toBe('#0e7490');
    expect(avatarColor('11111111-2222-3333-4444-555555555555')).toBe('#4457c2');
  });
});

describe('calendarColor', () => {
  it('uses the calendar’s own colour, else its kind’s, else Generic', () => {
    expect(calendarColor({ color: '#123456', kind: 'Personal' })).toBe('#123456');
    expect(calendarColor({ color: null, kind: 'Birthdays' })).toBe(KIND_COLORS.Birthdays);
    expect(calendarColor({ kind: 'SomethingNew' })).toBe(KIND_COLORS.Generic);
    expect(calendarColor(null)).toBe(KIND_COLORS.Generic);
  });
});
