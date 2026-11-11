import { describe, expect, it } from 'vitest';
import { MOVED_IN_AFTER_MOVED_OUT, compareFuzzy, definitelyAfter, residencyPeriodError, sortAddresses } from './residencyOrder';

describe('definitelyAfter', () => {
  it('decides on the first part that differs while both carry it', () => {
    expect(definitelyAfter({ year: 2021 }, { year: 2020, month: 12, day: 31 })).toBe(true);
    expect(definitelyAfter({ year: 2020, month: 7 }, { year: 2020, month: 6, day: 30 })).toBe(true);
    expect(definitelyAfter({ year: 2020, month: 6, day: 12 }, { year: 2020, month: 6, day: 11 })).toBe(true);
    expect(definitelyAfter({ year: 2020, month: 6, day: 11 }, { year: 2020, month: 6, day: 12 })).toBe(false);
  });

  it('is never sure when a missing part could put them in either order', () => {
    expect(definitelyAfter({ year: 2020, month: 6 }, { year: 2020 })).toBe(false);
    expect(definitelyAfter({ year: 2020, month: 6, day: 30 }, { year: 2020, month: 6 })).toBe(false);
    expect(definitelyAfter({ year: 2020 }, { year: 2020 })).toBe(false);
  });
});

describe('residencyPeriodError', () => {
  it('refuses a move-in certainly after the move-out', () => {
    expect(residencyPeriodError({ year: 2022 }, { year: 2021, month: 5 })).toBe(MOVED_IN_AFTER_MOVED_OUT);
  });

  it('lets an open, undated or ambiguous period through', () => {
    expect(residencyPeriodError({ year: 2022 }, null)).toBeNull();
    expect(residencyPeriodError(null, { year: 2021 })).toBeNull();
    expect(residencyPeriodError({ year: 2021, month: 9 }, { year: 2021 })).toBeNull();
  });
});

describe('compareFuzzy', () => {
  it('orders by year, then month, then day, a missing part first', () => {
    expect(compareFuzzy({ year: 2020 }, { year: 2020, month: 1 })).toBeLessThan(0);
    expect(compareFuzzy({ year: 2020, month: 2 }, { year: 2020, month: 1, day: 31 })).toBeGreaterThan(0);
    expect(compareFuzzy({ year: 2020, month: 2, day: 3 }, { year: 2020, month: 2, day: 3 })).toBe(0);
  });
});

describe('sortAddresses', () => {
  it('puts Home before Vacation, Work and Other, and the latest move-in first within a type, undated last', () => {
    const sorted = sortAddresses([
      { id: 'work', type: 'Work', movedIn: { year: 2024 } },
      { id: 'home-undated', type: 'Home' },
      { id: 'other', type: 'Other' },
      { id: 'home-2015', type: 'Home', movedIn: { year: 2015 } },
      { id: 'vacation', type: 'Vacation' },
      { id: 'home-2019', type: 'Home', movedIn: { year: 2019, month: 3 } },
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['home-2019', 'home-2015', 'home-undated', 'vacation', 'work', 'other']);
  });

  it('reads a missing type as Home and keeps ties in their given order', () => {
    const sorted = sortAddresses([
      { id: 'work', type: 'Work' },
      { id: 'a', type: null },
      { id: 'b', type: 'Home' },
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['a', 'b', 'work']);
  });
});
