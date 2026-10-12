// A contact birthday is a PartialDate: month+day always, year optional (unknown-year birthdays).
// Structural mirror of the contact API DTO. Kept generated-code-free: this package never imports DTO types.
export type PartialDate = {
  year: number | null;
  month: number;
  day: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Leap year so 29 Feb stays valid in the native date input when the real year is unknown.
const FALLBACK_YEAR = 2000;

/** "Jul 7, 1990", or "Jul 7" when the year is unknown. */
export function fmtPartialDate(b: PartialDate): string {
  const md = partialDateBadge(b);
  return b.year == null ? md : `${md}, ${b.year}`;
}

/** Compact month/day label for list badges (year omitted). */
export function partialDateBadge(b: PartialDate): string {
  return `${MONTHS[b.month - 1] ?? b.month} ${b.day}`;
}

/** PartialDate → "yyyy-MM-dd" for <input type="date">; leap-year fallback when year unknown. */
export function partialDateToInput(b: PartialDate | null | undefined): string {
  if (!b) return '';
  const y = String(b.year ?? FALLBACK_YEAR).padStart(4, '0');
  return `${y}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
}

/** A date-input value → PartialDate; year dropped when yearKnown is false. */
export function inputToPartialDate(value: string, yearKnown: boolean): PartialDate | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!m || !d) return null;
  return { year: yearKnown ? y : null, month: m, day: d };
}

/** Stable comparison key. */
export function partialDateKey(b: PartialDate | null | undefined): string {
  if (!b) return '';
  return `${b.year ?? ''}-${b.month}-${b.day}`;
}

/** The birthday editor's fields: a known year edits as one date input; an unknown year as month + day, so no
 *  fake year ever reaches the data. */
export type BirthdayFields = { yearKnown: boolean; date: string; month: string; day: string };

export function birthdayFields(b: PartialDate | null | undefined): BirthdayFields {
  const yearKnown = b ? b.year != null : true;
  return {
    yearKnown,
    date: yearKnown ? partialDateToInput(b) : '',
    month: !yearKnown && b ? String(Number(b.month)) : '',
    day: !yearKnown && b ? String(Number(b.day)) : '',
  };
}

export function birthdayFromFields(f: BirthdayFields): PartialDate | null {
  if (f.yearKnown) return inputToPartialDate(f.date, true);
  return f.month && f.day ? { year: null, month: Number(f.month), day: Number(f.day) } : null;
}

/** Localized month names, January first. */
export function monthNames(locale?: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'long' });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(FALLBACK_YEAR, i, 1)));
}

/** Days in `month` (1–12); with no year February allows the 29th. */
export function daysInMonth(month: number, year?: number | null): number {
  return new Date(year ?? FALLBACK_YEAR, month, 0).getDate();
}

/** The pair's day pulled back inside `month` (31 → 30 in April). */
export function clampBirthdayDay(month: string, day: string): string {
  const max = daysInMonth(Number(month));
  return Number(day) > max ? String(max) : day;
}

/** Flips the year switch without losing the day: month and day carry between the date and the pair, a year
 *  already entered is kept, and none is invented. */
export function withYearKnown(f: BirthdayFields, yearKnown: boolean): BirthdayFields {
  if (yearKnown === f.yearKnown) return f;
  const dated = inputToPartialDate(f.date, true);
  if (!yearKnown) return dated ? { ...f, yearKnown, month: String(dated.month), day: String(dated.day) } : { ...f, yearKnown };
  if (!dated || !f.month || !f.day) return { ...f, yearKnown };
  const month = Number(f.month);
  const day = Math.min(Number(f.day), daysInMonth(month, dated.year));
  return { ...f, yearKnown, date: partialDateToInput({ year: dated.year, month, day }) };
}
