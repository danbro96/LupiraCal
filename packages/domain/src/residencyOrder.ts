import type { FuzzyDate } from '@danbro96/lupira-domain-contacts/fuzzyDate';

export const compareFuzzy = (a: FuzzyDate, b: FuzzyDate) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0) || (a.day ?? 0) - (b.day ?? 0);

/** `a` lies after `b` whatever its missing parts turn out to be; contact-api's `FuzzyDate.DefinitelyAfter`. */
export function definitelyAfter(a: FuzzyDate, b: FuzzyDate): boolean {
  if (a.year !== b.year) return a.year > b.year;
  if (a.month == null || b.month == null) return false;
  if (a.month !== b.month) return a.month > b.month;
  if (a.day == null || b.day == null) return false;
  return a.day > b.day;
}

export const MOVED_IN_AFTER_MOVED_OUT = 'Moved in must not be after moved out.';

export function residencyPeriodError(movedIn: FuzzyDate | null | undefined, movedOut: FuzzyDate | null | undefined): string | null {
  return movedIn && movedOut && definitelyAfter(movedIn, movedOut) ? MOVED_IN_AFTER_MOVED_OUT : null;
}

const TYPE_ORDER = ['Home', 'Vacation', 'Work', 'Other'];

const typeRank = (type: string | null | undefined) => {
  const i = TYPE_ORDER.indexOf(type ?? 'Home');
  return i < 0 ? TYPE_ORDER.length : i;
};

/** Home, Vacation, Work, Other; within a type the latest move-in first, undated last. */
export function sortAddresses<T extends { type?: string | null; movedIn?: FuzzyDate | null }>(addresses: readonly T[]): T[] {
  return [...addresses].sort((a, b) => {
    const byType = typeRank(a.type) - typeRank(b.type);
    if (byType || (!a.movedIn && !b.movedIn)) return byType;
    if (!a.movedIn) return 1;
    if (!b.movedIn) return -1;
    return compareFuzzy(b.movedIn, a.movedIn);
  });
}
