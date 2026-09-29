// Age math for the read-only birthday card. Pure — callers pass coerced numbers (no PartialDate coupling).

import { fmtDate } from './time';

/** Age reached on the birthday occurrence dated `on` (its month/day is the birthday). Null when the birth year is unknown. */
export function turningAge(birthYear: number | null, on: Date): number | null {
  return birthYear == null ? null : on.getFullYear() - birthYear;
}

/** The birthday's next occurrence on or after `from` — the deep-link fallback when no clicked date is supplied. */
export function nextBirthday(month: number, day: number, from: Date): Date {
  const at = (y: number) => new Date(y, month - 1, day);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const thisYear = at(from.getFullYear());
  return thisYear >= today ? thisYear : at(from.getFullYear() + 1);
}

/** The age line both apps show under a birthday: "Turning 40 on 3 Mar 2027", or "Would have turned …" for a
 *  contact who has died. */
export function birthdayAgeLine(age: number, on: Date, deceased: boolean): string {
  return `${deceased ? 'Would have turned' : 'Turning'} ${age} on ${fmtDate(on)}`;
}
