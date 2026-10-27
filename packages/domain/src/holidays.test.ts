import { describe, expect, it } from 'vitest';
import { isHolidayOrigin, isRedDay } from './holidays';

describe('holidays', () => {
  it('recognises a holiday origin', () => {
    expect(isHolidayOrigin({ kind: 'Holiday' })).toBe(true);
    expect(isHolidayOrigin({ kind: 'Birthday' })).toBe(false);
    expect(isHolidayOrigin(null)).toBe(false);
  });

  it('marks only public holidays as red days', () => {
    expect(isRedDay({ holiday: 'PublicHoliday' })).toBe(true);
    expect(isRedDay({ holiday: 'Eve' })).toBe(false);
    expect(isRedDay({})).toBe(false);
  });
});
