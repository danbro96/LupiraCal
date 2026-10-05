import type { SqlValue, Tx } from '@danbro96/lupira-expo-sqlite/types';
import { currentHorizon, occurrenceRowsForItem } from '../../domain/materialize';
import type { MirrorItem } from '../../domain/mirrorReducers';

export const ITEM_TABLES = ['item_index', 'item_calendars', 'item_occurrences'];

export const ITEM_DDL = `
  CREATE TABLE item_index (
    id TEXT PRIMARY KEY,
    title TEXT,
    status TEXT,
    is_all_day INTEGER NOT NULL,
    start_utc TEXT,
    recurrence_rule TEXT,
    place_id TEXT,
    avail_status TEXT,
    search_text TEXT NOT NULL
  );
  CREATE TABLE item_calendars (
    item_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (item_id, calendar_id)
  );
  CREATE INDEX item_calendars_calendar ON item_calendars (calendar_id);
  CREATE TABLE item_occurrences (
    item_id TEXT NOT NULL,
    start_utc TEXT NOT NULL,
    end_utc TEXT,
    start_day TEXT NOT NULL,
    all_day INTEGER NOT NULL,
    PRIMARY KEY (item_id, start_utc)
  );
  CREATE INDEX item_occurrences_day ON item_occurrences (start_day);
`;

/** Occurrences are materialized over the current horizon, so every write re-expands the item's recurrence. */
export async function writeItemIndex(tx: Tx, id: string, state: MirrorItem | null): Promise<void> {
  await tx.run('DELETE FROM item_index WHERE id = ?', [id]);
  await tx.run('DELETE FROM item_calendars WHERE item_id = ?', [id]);
  await tx.run('DELETE FROM item_occurrences WHERE item_id = ?', [id]);
  if (!state) return;
  const d = state.doc;
  await tx.run(
    `INSERT INTO item_index (id, title, status, is_all_day, start_utc, recurrence_rule, place_id, avail_status, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, d.title ?? null, d.status ?? null, d.isAllDay ? 1 : 0, d.startsAt ?? null, d.recurrenceRule ?? null,
      d.placeId ?? null, presenceStatusOf(d.details), searchTextOf([d.title, d.description, d.category, ...(d.tags ?? [])])],
  );
  await insertChunked(tx, 'INSERT OR REPLACE INTO item_calendars (item_id, calendar_id, status)', 3,
    d.calendars.map((m) => [id, m.calendarId, m.status]));
  await insertChunked(tx, 'INSERT OR REPLACE INTO item_occurrences (item_id, start_utc, end_utc, start_day, all_day)', 5,
    occurrenceRowsForItem(d, currentHorizon()).map((r) => [id, r.startUtc, r.endUtc, r.startDay, r.allDay ? 1 : 0]));
}

const presenceStatusOf = (details: unknown): string | null =>
  (details as { presence?: { status?: string | null } } | null | undefined)?.presence?.status ?? null;

// Lowercased in JS: SQLite's lower() folds ASCII only, so "Årsmöte" would never match "års".
const searchTextOf = (parts: (string | null | undefined)[]): string => parts.filter(Boolean).join(' ').toLowerCase();

/** Multi-row VALUES batches: the first full sync writes tens of thousands of occurrence rows, and one
 *  awaited bridge round-trip per row is what made it take minutes. ~40 rows/statement keeps parameter
 *  counts well under SQLite's limit. */
const INSERT_CHUNK = 40;

async function insertChunked(tx: Tx, insertPrefix: string, columns: number, rows: SqlValue[][]): Promise<void> {
  const tuple = `(${Array(columns).fill('?').join(', ')})`;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const slice = rows.slice(i, i + INSERT_CHUNK);
    await tx.run(`${insertPrefix} VALUES ${Array(slice.length).fill(tuple).join(', ')}`, slice.flat());
  }
}
