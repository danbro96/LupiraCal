import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import type { HolidayDoc } from '../../domain/docTypes';
import { occurrenceDay } from '../../domain/materialize';
import { insertChunked } from './items';

export const HOLIDAY_TABLES = ['holiday_occurrences'];

export const HOLIDAY_DDL = `
  CREATE TABLE holiday_occurrences (
    holiday_id TEXT NOT NULL,
    calendar_ids TEXT NOT NULL,
    start_utc TEXT NOT NULL,
    start_day TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL
  );
  CREATE INDEX holiday_occurrences_holiday ON holiday_occurrences (holiday_id);
  CREATE INDEX holiday_occurrences_day ON holiday_occurrences (start_day);
`;

/** The server lists each holiday's dates over its sync window, so each write replaces the holiday's rows wholesale. */
export async function writeHolidayIndex(tx: Tx, id: string, state: { doc: HolidayDoc } | null): Promise<void> {
  await tx.run('DELETE FROM holiday_occurrences WHERE holiday_id = ?', [id]);
  const h = state?.doc;
  if (!h) return;
  const calendarIds = JSON.stringify(h.calendarIds);
  await insertChunked(tx, 'INSERT INTO holiday_occurrences (holiday_id, calendar_ids, start_utc, start_day, title, kind)', 6,
    h.dates.map((d) => {
      const start = new Date(`${d}T00:00:00Z`);
      return [id, calendarIds, start.toISOString(), occurrenceDay(start, true), h.name, h.kind];
    }));
}
