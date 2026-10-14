import { expandSeries } from '@lupira/cal-domain/seriesOccurrences';
import { ymd } from '@danbro96/lupira-domain-core/time';
import type { ContactDoc, ItemDoc } from './docTypes';

/** The single grid read path: every visible instant becomes one occurrence row in the index, recomputed
 *  per source aggregate inside the same exclusive transaction that changed it. Grids never expand recurrence
 *  at render time — they run one indexed start_day range query. */

export type OccurrenceRow = {
  source: 'item' | 'birthday';
  sourceId: string;
  /** The occurrence's key in its series; null for a one-off item and for birthdays. */
  originalStart: string | null;
  startUtc: string;
  endUtc: string | null;
  /** This occurrence's own title and status where it changes them; null inherits the item's. */
  title: string | null;
  status: string | null;
  /** Grid bucket. Timed occurrences bucket by the DEVICE's local day (grids are local); all-day occurrences
   *  keep their calendar date verbatim (an all-day event belongs to its date in every timezone). */
  startDay: string;
  allDay: boolean;
};

export type Horizon = { start: Date; end: Date };

/** Rolling window the mirror keeps materialized. Re-materialize everything when the stored horizon drifts
 *  more than a month from the current one (see horizonDrifted). */
export function currentHorizon(now: Date = new Date()): Horizon {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth() + 1, 1)),
  };
}

export function horizonDrifted(stored: Horizon, current: Horizon): boolean {
  const monthMs = 32 * 86_400_000;
  return Math.abs(stored.start.getTime() - current.start.getTime()) > monthMs
    || Math.abs(stored.end.getTime() - current.end.getTime()) > monthMs;
}

export function occurrenceRowsForItem(doc: ItemDoc, horizon: Horizon): OccurrenceRow[] {
  const allDay = doc.isAllDay === true;
  const start = allDay
    ? (doc.startDate ? new Date(`${doc.startDate}T00:00:00Z`) : null)
    : (doc.startsAt ? new Date(doc.startsAt) : null);
  if (!start || Number.isNaN(start.getTime())) return [];   // startless items never hit the grid

  const end = allDay
    ? (doc.endDate ? new Date(`${doc.endDate}T00:00:00Z`) : null)
    : (doc.endsAt ? new Date(doc.endsAt) : null);
  const durationMs = end && end.getTime() > start.getTime() ? end.getTime() - start.getTime() : null;
  const recurring = !!doc.recurrenceRule?.trim();

  return expandSeries(doc, horizon.start, horizon.end).map((o) => {
    const s = new Date(o.start);
    const changedEnd = o.change?.endsAt ? Date.parse(o.change.endsAt) : null;
    const endMs = changedEnd !== null ? (changedEnd > s.getTime() ? changedEnd : null) : durationMs !== null ? s.getTime() + durationMs : null;
    return {
      source: 'item',
      sourceId: doc.id,
      originalStart: recurring ? o.originalStart : null,
      startUtc: s.toISOString(),
      endUtc: endMs !== null ? new Date(endMs).toISOString() : null,
      title: o.change?.title ?? null,
      status: o.change?.status ?? null,
      startDay: allDay ? utcDayKey(s) : ymd(s),
      allDay,
    };
  });
}

/** Birthdays synthesize straight into the occurrence table — never stored as items (matching the server's
 *  read-time projection). Year-less birthdays still recur; Feb 29 lands only in leap years. */
export function birthdayRows(contact: ContactDoc, horizon: Horizon): OccurrenceRow[] {
  if (!contact.birthday) return [];
  const { month, day } = contact.birthday;
  if (month < 1 || month > 12 || day < 1) return [];

  const rows: OccurrenceRow[] = [];
  for (let year = horizon.start.getUTCFullYear(); year <= horizon.end.getUTCFullYear(); year++) {
    if (day > daysInMonth(year, month)) continue;
    const start = new Date(Date.UTC(year, month - 1, day));
    if (start.getTime() < horizon.start.getTime() || start.getTime() >= horizon.end.getTime()) continue;
    rows.push({
      source: 'birthday',
      sourceId: contact.id,
      originalStart: null,
      startUtc: start.toISOString(),
      endUtc: null,
      title: null,
      status: null,
      startDay: utcDayKey(start),
      allDay: true,
    });
  }
  return rows;
}

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
