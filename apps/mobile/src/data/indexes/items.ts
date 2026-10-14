import type { SqlValue, Tx } from '@danbro96/lupira-expo-sqlite/types';
import type { ItemDoc } from '../../domain/docTypes';
import { currentHorizon, occurrenceRowsForItem } from '../../domain/materialize';
import type { MirrorItem } from '../../domain/mirrorReducers';

export const ITEM_TABLES = ['item_index', 'item_calendars', 'item_occurrences', 'item_attendees', 'item_places'];

export const ITEM_DDL = `
  CREATE TABLE item_index (
    id TEXT PRIMARY KEY,
    title TEXT,
    status TEXT,
    is_all_day INTEGER NOT NULL,
    start_utc TEXT,
    recurrence_rule TEXT,
    place_id TEXT,
    location_label TEXT,
    category TEXT,
    avail_status TEXT,
    parent_item_id TEXT,
    search_text TEXT NOT NULL
  );
  CREATE INDEX item_index_parent ON item_index (parent_item_id);
  CREATE INDEX item_index_category_place ON item_index (category, place_id);
  CREATE TABLE item_calendars (
    item_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (item_id, calendar_id)
  );
  CREATE INDEX item_calendars_calendar ON item_calendars (calendar_id);
  CREATE TABLE item_occurrences (
    item_id TEXT NOT NULL,
    original_start TEXT,
    start_utc TEXT NOT NULL,
    end_utc TEXT,
    start_day TEXT NOT NULL,
    all_day INTEGER NOT NULL,
    title TEXT,
    status TEXT
  );
  CREATE INDEX item_occurrences_item ON item_occurrences (item_id, start_utc);
  CREATE INDEX item_occurrences_day ON item_occurrences (start_day);
  CREATE TABLE item_attendees (
    item_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    status TEXT NOT NULL,
    reminder_mode TEXT,
    reminder_minutes INTEGER,
    PRIMARY KEY (item_id, contact_id)
  );
  CREATE INDEX item_attendees_contact ON item_attendees (contact_id);
  CREATE TABLE item_places (
    item_id TEXT NOT NULL,
    place_id TEXT NOT NULL,
    label TEXT,
    PRIMARY KEY (item_id, place_id)
  );
`;

/** Occurrences are materialized over the current horizon, so every write re-expands the item's recurrence. */
export async function writeItemIndex(tx: Tx, id: string, state: MirrorItem | null): Promise<void> {
  await tx.run('DELETE FROM item_index WHERE id = ?', [id]);
  await tx.run('DELETE FROM item_calendars WHERE item_id = ?', [id]);
  await tx.run('DELETE FROM item_occurrences WHERE item_id = ?', [id]);
  await tx.run('DELETE FROM item_attendees WHERE item_id = ?', [id]);
  await tx.run('DELETE FROM item_places WHERE item_id = ?', [id]);
  if (!state) return;
  const d = state.doc;
  await tx.run(
    `INSERT INTO item_index (id, title, status, is_all_day, start_utc, recurrence_rule, place_id, location_label, category, avail_status,
       parent_item_id, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, d.title ?? null, d.status ?? null, d.isAllDay ? 1 : 0, d.startsAt ?? null, d.recurrenceRule ?? null,
      d.placeId ?? null, d.locationLabel ?? null, d.category ?? null, presenceStatusOf(d.details), d.parentItemId ?? null, searchTextOf([d.title, d.description, d.category, ...(d.tags ?? [])])],
  );
  await insertChunked(tx, 'INSERT OR REPLACE INTO item_calendars (item_id, calendar_id, status)', 3,
    d.calendars.map((m) => [id, m.calendarId, m.status]));
  await insertChunked(tx, 'INSERT INTO item_occurrences (item_id, original_start, start_utc, end_utc, start_day, all_day, title, status)', 8,
    occurrenceRowsForItem(d, currentHorizon()).map((r) => [id, r.originalStart, r.startUtc, r.endUtc, r.startDay, r.allDay ? 1 : 0, r.title, r.status]));
  await insertChunked(tx, 'INSERT OR REPLACE INTO item_attendees (item_id, contact_id, status, reminder_mode, reminder_minutes)', 5,
    (d.attendees ?? []).map((a) => [id, a.contactId, a.status, a.reminder?.mode ?? null, a.reminder?.minutesBefore ?? null]));
  await insertChunked(tx, 'INSERT INTO item_places (item_id, place_id, label)', 3,
    placeRefsOf(d).map((r) => [id, r.placeId, r.label]));
}

/** The item's place, then its travel endpoints, each place once: what cal-api's place usage counts per occurrence. */
function placeRefsOf(d: ItemDoc): { placeId: string; label: string | null }[] {
  const travel = (d.details as { travel?: TravelEnds | null } | null | undefined)?.travel;
  const refs: { placeId: string; label: string | null }[] = [];
  for (const [placeId, label] of [
    [d.placeId, d.locationLabel], [travel?.fromPlaceId, travel?.fromLabel], [travel?.toPlaceId, travel?.toLabel],
  ] as const) {
    if (placeId && !refs.some((r) => r.placeId === placeId)) refs.push({ placeId, label: label?.trim() ? label : null });
  }
  return refs;
}

type TravelEnds = { fromPlaceId?: string | null; fromLabel?: string | null; toPlaceId?: string | null; toLabel?: string | null };

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
