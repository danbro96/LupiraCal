import type { RelationCopy, StoredRelation } from '@lupira/cal-domain/contactRelations';
import type { ContactGuards, ItemGuards } from '../domain/docTypes';
import type { ContactDoc, ItemDoc } from '../domain/docTypes';
import type { OccurrenceRow } from '../domain/materialize';
import type { MirrorContact, MirrorItem } from '../domain/mirrorReducers';
import type { ClientOp } from '../domain/ops';
import { OP_ENVELOPE_VERSION, aggregateIdOf, domainOf } from '../domain/ops';
import type { SqlValue, Tx } from './db/types';

/** Row-level persistence for the mirror. Every function takes a Tx — writes only ever happen inside
 *  Db.exclusive, so a pull can never interleave with an enqueue (the tasks app's transaction defect). */

type ItemRow = { id: string; doc: string; guards: string; deleted: number };

export async function loadItem(tx: Tx, id: string): Promise<MirrorItem | null> {
  const row = await tx.first<ItemRow>('SELECT id, doc, guards, deleted FROM items WHERE id = ?', [id]);
  if (!row) return null;
  return { doc: JSON.parse(row.doc) as ItemDoc, guards: JSON.parse(row.guards) as ItemGuards, deleted: row.deleted === 1 };
}

export async function saveItem(tx: Tx, state: MirrorItem, occurrences: OccurrenceRow[]): Promise<void> {
  const d = state.doc;
  await tx.run(
    `INSERT INTO items (id, doc, guards, title, status, is_all_day, start_utc, end_utc, recurrence_rule, deleted, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET doc=excluded.doc, guards=excluded.guards, title=excluded.title,
       status=excluded.status, is_all_day=excluded.is_all_day, start_utc=excluded.start_utc,
       end_utc=excluded.end_utc, recurrence_rule=excluded.recurrence_rule, deleted=excluded.deleted,
       updated_at=excluded.updated_at`,
    [d.id, JSON.stringify(d), JSON.stringify(state.guards), d.title ?? null, d.status ?? null,
      d.isAllDay ? 1 : 0, d.startsAt ?? null, d.endsAt ?? null, d.recurrenceRule ?? null,
      state.deleted ? 1 : 0, d.updatedAt ?? ''],
  );
  await tx.run('DELETE FROM item_calendars WHERE item_id = ?', [d.id]);
  await insertChunked(tx, 'INSERT OR REPLACE INTO item_calendars (item_id, calendar_id, status)', 3,
    d.calendars.map((m) => [d.id, m.calendarId, m.status]));
  await replaceOccurrences(tx, 'item', d.id, occurrences);
}

export async function removeItem(tx: Tx, id: string): Promise<void> {
  await tx.run('DELETE FROM items WHERE id = ?', [id]);
  await tx.run('DELETE FROM item_calendars WHERE item_id = ?', [id]);
  await tx.run("DELETE FROM occurrences WHERE source = 'item' AND source_id = ?", [id]);
}

export async function allItemIds(tx: Tx): Promise<string[]> {
  return (await tx.all<{ id: string }>('SELECT id FROM items')).map((r) => r.id);
}

type ContactRow = { id: string; doc: string; guards: string; deleted: number };

export async function loadContact(tx: Tx, id: string): Promise<MirrorContact | null> {
  const row = await tx.first<ContactRow>('SELECT id, doc, guards, deleted FROM contacts WHERE id = ?', [id]);
  if (!row) return null;
  return { doc: JSON.parse(row.doc) as ContactDoc, guards: JSON.parse(row.guards) as ContactGuards, deleted: row.deleted === 1 };
}

export async function saveContact(tx: Tx, state: MirrorContact, birthdays: OccurrenceRow[]): Promise<void> {
  const d = state.doc;
  const bday = d.birthday ?? null;
  await tx.run(
    `INSERT INTO contacts (id, doc, guards, display_name, address_book_id, bday_year, bday_month, bday_day, deleted, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET doc=excluded.doc, guards=excluded.guards, display_name=excluded.display_name,
       address_book_id=excluded.address_book_id, bday_year=excluded.bday_year, bday_month=excluded.bday_month,
       bday_day=excluded.bday_day, deleted=excluded.deleted, updated_at=excluded.updated_at`,
    [d.id, JSON.stringify(d), JSON.stringify(state.guards), composeDisplayName(d), d.addressBookId,
      bday?.year ?? null, bday?.month ?? null, bday?.day ?? null,
      state.deleted ? 1 : 0, d.updatedAt ?? ''],
  );
  await replaceOccurrences(tx, 'birthday', d.id, birthdays);
}

export async function removeContact(tx: Tx, id: string): Promise<void> {
  await tx.run('DELETE FROM contacts WHERE id = ?', [id]);
  await tx.run("DELETE FROM occurrences WHERE source = 'birthday' AND source_id = ?", [id]);
}

export async function allContactIds(tx: Tx): Promise<string[]> {
  return (await tx.all<{ id: string }>('SELECT id FROM contacts')).map((r) => r.id);
}

/** Server composition mirrored (Contact.DisplayName): format-specific label, falling back to the full
 *  composition, then nickname — never empty for a named contact. */
export function composeDisplayName(d: ContactDoc): string {
  const parts = (xs: (string | null | undefined)[]) => xs.filter((s) => s && s.trim().length > 0).join(' ');
  const full = parts([d.givenName, d.middleName, d.familyName]) || (d.nickname ?? '') || d.id;
  switch (d.displayNameFormat) {
    case 'FirstLast': return parts([d.givenName, d.familyName]) || full;
    case 'NickName': return d.nickname || full;
    default: return full;
  }
}


async function replaceOccurrences(tx: Tx, source: 'item' | 'birthday', sourceId: string, rows: OccurrenceRow[]): Promise<void> {
  await tx.run('DELETE FROM occurrences WHERE source = ? AND source_id = ?', [source, sourceId]);
  await insertChunked(tx, 'INSERT OR REPLACE INTO occurrences (source, source_id, start_utc, end_utc, start_day, all_day)', 6,
    rows.map((r) => [r.source, r.sourceId, r.startUtc, r.endUtc, r.startDay, r.allDay ? 1 : 0]));
}

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

export type OccurrenceQueryRow = {
  source: string; source_id: string; start_utc: string; end_utc: string | null; start_day: string; all_day: number;
};

export async function occurrencesBetween(tx: Tx, fromDay: string, toDay: string): Promise<OccurrenceQueryRow[]> {
  return tx.all<OccurrenceQueryRow>(
    'SELECT * FROM occurrences WHERE start_day >= ? AND start_day <= ? ORDER BY start_utc',
    [fromDay, toDay],
  );
}

export type GridRow = OccurrenceQueryRow & {
  title: string | null;
  status: string | null;
  calendar_id: string | null;
  /** 1 when the item lives in the Availability-kind calendar — grids render these as the background
   *  band (status in avail_status), never as chips. */
  is_availability: number | null;
  avail_status: string | null;
  place_id: string | null;
};

/** What the grids and search show: items accepted into a shown calendar, and birthdays when theirs is shown. */
export type CalendarFilter = { calendarIds: string[]; birthdays: boolean };

const inShownCalendars = (itemId: string) => `EXISTS (
         SELECT 1 FROM item_calendars icf
         WHERE icf.item_id = ${itemId} AND icf.status = 'Accepted'
           AND icf.calendar_id IN (SELECT value FROM json_each(?)))`;

const preferredCalendar = (itemId: string) => `(SELECT ic.calendar_id FROM item_calendars ic WHERE ic.item_id = ${itemId}
             ORDER BY CASE ic.status WHEN 'Accepted' THEN 0 ELSE 1 END, ic.calendar_id LIMIT 1)`;

/** The grids' one read: occurrences joined with just enough display data (title, status, a calendar for the
 *  color). Still a single indexed start_day range — no per-item fan-out, no render-time expansion. */
export async function gridRowsBetween(tx: Tx, fromDay: string, toDay: string, filter?: CalendarFilter): Promise<GridRow[]> {
  const shownFilter = filter ? `
       AND (CASE o.source WHEN 'item' THEN ${inShownCalendars('o.source_id')} ELSE ? END)` : '';
  return tx.all<GridRow>(
    `SELECT o.source, o.source_id, o.start_utc, o.end_utc, o.start_day, o.all_day,
            COALESCE(i.title, c.display_name) AS title,
            i.status AS status,
            ${preferredCalendar('o.source_id')} AS calendar_id,
            (SELECT 1 FROM item_calendars ia JOIN calendars ca ON ca.id = ia.calendar_id
             WHERE ia.item_id = o.source_id AND json_extract(ca.doc, '$.kind') = 'Availability' LIMIT 1) AS is_availability,
            json_extract(i.doc, '$.details.presence.status') AS avail_status,
            json_extract(i.doc, '$.placeId') AS place_id
     FROM occurrences o
     LEFT JOIN items i ON o.source = 'item' AND i.id = o.source_id
     LEFT JOIN contacts c ON o.source = 'birthday' AND c.id = o.source_id
     WHERE o.start_day >= ? AND o.start_day <= ?${shownFilter}
     ORDER BY o.start_utc`,
    [fromDay, toDay, ...(filter ? [JSON.stringify(filter.calendarIds), filter.birthdays ? 1 : 0] : [])],
  );
}

export type ItemSearchRow = {
  id: string;
  title: string | null;
  status: string | null;
  is_all_day: number;
  recurrence_rule: string | null;
  calendar_id: string | null;
  /** First occurrence on or after `today`; null when the item has none left in the mirror's window. */
  next_utc: string | null;
  /** Last occurrence before `today`, else the item's own start (it may predate the window). */
  last_utc: string | null;
};

// SQLite's lower() and LIKE fold ASCII only, so "års" would miss "Årsmöte". The query side is
// lowercased in JS; this folds the capitals a family calendar actually contains.
const FOLDED = ['Å', 'Ä', 'Ö', 'É', 'È', 'Ü', 'Æ', 'Ø'];
const fold = (expr: string) => FOLDED.reduce((e, ch) => `REPLACE(${e}, '${ch}', '${ch.toLowerCase()}')`, `lower(${expr})`);
const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

/** Free-text search over the mirror, so it works offline. Every whitespace-separated term must appear in
 *  the title, description, category or tags. Upcoming items first (soonest first), then past ones (most
 *  recent first) — `today` is a local 'yyyy-MM-dd', compared against start_day so an all-day item on
 *  today still counts as upcoming. */
export async function searchItems(tx: Tx, query: string, today: string, filter?: CalendarFilter, limit = 100): Promise<ItemSearchRow[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const haystack = fold(`COALESCE(i.title, '') || ' ' || COALESCE(json_extract(i.doc, '$.description'), '') || ' ' ||
    COALESCE(json_extract(i.doc, '$.category'), '') || ' ' ||
    COALESCE((SELECT group_concat(t.value, ' ') FROM json_each(i.doc, '$.tags') t), '')`);
  return tx.all<ItemSearchRow>(
    `SELECT i.id, i.title, i.status, i.is_all_day, i.recurrence_rule,
            ${preferredCalendar('i.id')} AS calendar_id,
            (SELECT MIN(o.start_utc) FROM occurrences o
             WHERE o.source = 'item' AND o.source_id = i.id AND o.start_day >= ?) AS next_utc,
            COALESCE((SELECT MAX(o.start_utc) FROM occurrences o
             WHERE o.source = 'item' AND o.source_id = i.id AND o.start_day < ?), i.start_utc) AS last_utc
     FROM items i
     WHERE i.deleted = 0
       ${terms.map(() => `AND ${haystack} LIKE ? ESCAPE '\\'`).join('\n       ')}
       ${filter ? `AND ${inShownCalendars('i.id')}` : ''}
     ORDER BY next_utc IS NULL, next_utc, last_utc DESC
     LIMIT ?`,
    [today, today, ...terms.map(likeTerm), ...(filter ? [JSON.stringify(filter.calendarIds)] : []), limit],
  );
}

export type MapEventRow = {
  source_id: string;
  start_utc: string;
  title: string | null;
  place_id: string;
  calendar_id: string | null;
};

/** Map pins: one row per placed item with an occurrence in range. Recurring items repeat occurrence
 *  rows but share one place — GROUP BY collapses them to the earliest occurrence in the window. */
export async function mapEventRowsBetween(tx: Tx, fromDay: string, toDay: string): Promise<MapEventRow[]> {
  return tx.all<MapEventRow>(
    `SELECT o.source_id, MIN(o.start_utc) AS start_utc, i.title,
            json_extract(i.doc, '$.placeId') AS place_id,
            ${preferredCalendar('o.source_id')} AS calendar_id
     FROM occurrences o
     JOIN items i ON o.source = 'item' AND i.id = o.source_id AND i.deleted = 0
     WHERE o.start_day >= ? AND o.start_day <= ? AND json_extract(i.doc, '$.placeId') IS NOT NULL
     GROUP BY o.source_id
     ORDER BY start_utc`,
    [fromDay, toDay],
  );
}

/** The next placed events from `nowIso`, soonest first: one row per item (a series by its next occurrence),
 *  an event already under way included, cancelled ones not. */
export async function upcomingPlacedEvents(tx: Tx, nowIso: string, limit: number): Promise<MapEventRow[]> {
  return tx.all<MapEventRow>(
    `SELECT o.source_id, MIN(o.start_utc) AS start_utc, i.title,
            json_extract(i.doc, '$.placeId') AS place_id,
            ${preferredCalendar('o.source_id')} AS calendar_id
     FROM occurrences o
     JOIN items i ON o.source = 'item' AND i.id = o.source_id AND i.deleted = 0
     WHERE COALESCE(o.end_utc, o.start_utc) >= ? AND json_extract(i.doc, '$.placeId') IS NOT NULL
       AND COALESCE(json_extract(i.doc, '$.status'), '') != 'Cancelled'
     GROUP BY o.source_id
     ORDER BY start_utc
     LIMIT ?`,
    [nowIso, limit],
  );
}

export type MapContactRow = {
  contact_id: string;
  display_name: string;
  place_id: string;
  address_type: string | null;
  moved_in: string | null;
  moved_out: string | null;
};

/** Contact addresses for the map. `json_each` walks the address array stored inside the contact doc,
 *  so this is a pure mirror read — the layer works offline, unlike the web's which refetches every
 *  contact. Fuzzy dates come back as JSON for the caller's residency logic. */
export async function mapContactAddresses(tx: Tx): Promise<MapContactRow[]> {
  return tx.all<MapContactRow>(
    `SELECT c.id AS contact_id, c.display_name,
            json_extract(a.value, '$.placeId') AS place_id,
            json_extract(a.value, '$.type')    AS address_type,
            json_extract(a.value, '$.movedIn')  AS moved_in,
            json_extract(a.value, '$.movedOut') AS moved_out
     FROM contacts c, json_each(json_extract(c.doc, '$.addresses')) a
     WHERE c.deleted = 0 AND json_extract(a.value, '$.placeId') IS NOT NULL
     ORDER BY c.display_name COLLATE NOCASE`,
  );
}

export type RelationCopyRow = RelationCopy & { otherId: string; otherName: string };

/** Every stored copy of a relationship touching `contactId`: the ones its own doc holds and the ones
 *  other contacts hold about it, with the other contact's name. Copies whose other side is deleted or
 *  absent from the mirror are dropped, as the server's listing drops them. */
export async function relationCopiesOf(tx: Tx, contactId: string): Promise<RelationCopyRow[]> {
  const rows = await tx.all<{ holder_id: string; edge: string; other_id: string; other_name: string }>(
    `SELECT c.id AS holder_id, r.value AS edge, o.id AS other_id, o.display_name AS other_name
     FROM contacts c
     JOIN json_each(json_extract(c.doc, '$.relations')) r
     JOIN contacts o ON o.deleted = 0
       AND o.id = CASE WHEN c.id = ? THEN json_extract(r.value, '$.toContactId') ELSE c.id END
     WHERE c.id = ? OR (c.deleted = 0 AND json_extract(r.value, '$.toContactId') = ?)`,
    [contactId, contactId, contactId],
  );
  return rows.map((r) => ({
    holderId: r.holder_id,
    edge: JSON.parse(r.edge) as StoredRelation,
    otherId: r.other_id,
    otherName: r.other_name,
  }));
}

export type ContactListRow = { id: string; displayName: string; doc: ContactDoc };

export async function listContacts(tx: Tx): Promise<ContactListRow[]> {
  const rows = await tx.all<{ id: string; display_name: string; doc: string }>(
    'SELECT id, display_name, doc FROM contacts WHERE deleted = 0 ORDER BY display_name COLLATE NOCASE');
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, doc: JSON.parse(r.doc) as ContactDoc }));
}

/** Returns whether anything changed — every sync fetches the full container set, which is usually
 *  identical, and rewriting it would refetch every container query for nothing. */
export async function replaceContainers(tx: Tx, table: 'calendars' | 'address_books' | 'contact_groups', docs: { id: string }[]): Promise<boolean> {
  const stored = await tx.all<{ id: string; doc: string }>(`SELECT id, doc FROM ${table}`);
  const storedById = new Map(stored.map((r) => [r.id, r.doc]));
  if (stored.length === docs.length && docs.every((d) => storedById.get(d.id) === JSON.stringify(d))) return false;
  await tx.run(`DELETE FROM ${table}`);
  for (const doc of docs)
    await tx.run(`INSERT INTO ${table} (id, doc) VALUES (?, ?)`, [doc.id, JSON.stringify(doc)]);
  return true;
}

export type OutboxRow = {
  seq: number; op_id: string; envelope_version: number; domain: string; aggregate_id: string;
  kind: string; payload: string; occurred_at: string; status: string; attempts: number;
  next_attempt_at: string | null; last_error: string | null;
};

export function opOfRow(row: OutboxRow): ClientOp {
  return JSON.parse(row.payload) as ClientOp;
}

export async function insertOp(tx: Tx, op: ClientOp): Promise<void> {
  await tx.run(
    `INSERT INTO outbox (op_id, envelope_version, domain, aggregate_id, kind, payload, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [op.commandId, OP_ENVELOPE_VERSION, domainOf(op), aggregateIdOf(op), op.kind, JSON.stringify(op), op.occurredAt],
  );
}

/** The next op the drain may replay: oldest pending row that is due AND has no earlier parked sibling on the
 *  same aggregate — a parked create must hold back the revisions behind it instead of guaranteeing their 404s. */
export async function nextEligibleOp(tx: Tx, nowIso: string): Promise<OutboxRow | null> {
  return tx.first<OutboxRow>(
    `SELECT * FROM outbox o
     WHERE o.status = 'pending'
       AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?)
       AND NOT EXISTS (
         SELECT 1 FROM outbox p
         WHERE p.aggregate_id = o.aggregate_id AND p.status = 'parked' AND p.seq < o.seq)
     ORDER BY o.seq LIMIT 1`,
    [nowIso],
  );
}

export async function opsForAggregate(tx: Tx, aggregateId: string): Promise<OutboxRow[]> {
  // Parked ops included: their optimistic effect must survive a rebase (they're still the user's intent
  // until explicitly discarded) — the tasks app silently reverted them on every pull.
  return tx.all<OutboxRow>(
    "SELECT * FROM outbox WHERE aggregate_id = ? AND status IN ('pending', 'parked') ORDER BY seq",
    [aggregateId],
  );
}

export async function deleteOp(tx: Tx, seq: number): Promise<void> {
  await tx.run('DELETE FROM outbox WHERE seq = ?', [seq]);
}

export async function markFailure(tx: Tx, seq: number, park: boolean, nextAttemptAt: string | null, error: string): Promise<void> {
  await tx.run(
    'UPDATE outbox SET status = ?, attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE seq = ?',
    [park ? 'parked' : 'pending', nextAttemptAt, error, seq],
  );
}

export async function requeueParked(tx: Tx, seq: number): Promise<void> {
  await tx.run("UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = NULL, last_error = NULL WHERE seq = ?", [seq]);
}

export async function listParked(tx: Tx): Promise<OutboxRow[]> {
  return tx.all<OutboxRow>("SELECT * FROM outbox WHERE status = 'parked' ORDER BY seq");
}

export async function listPendingOps(tx: Tx): Promise<OutboxRow[]> {
  return tx.all<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' ORDER BY seq");
}

export async function outboxCounts(tx: Tx): Promise<{ pending: number; parked: number }> {
  const rows = await tx.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM outbox GROUP BY status');
  return {
    pending: rows.find((r) => r.status === 'pending')?.n ?? 0,
    parked: rows.find((r) => r.status === 'parked')?.n ?? 0,
  };
}

export async function pendingCreateAggregates(tx: Tx): Promise<Set<string>> {
  const rows = await tx.all<{ aggregate_id: string }>(
    "SELECT DISTINCT aggregate_id FROM outbox WHERE kind IN ('item.create', 'contact.create')");
  return new Set(rows.map((r) => r.aggregate_id));
}

export async function getCursor(tx: Tx, scope: 'cal' | 'contact'): Promise<string | null> {
  const row = await tx.first<{ cursor: string | null }>('SELECT cursor FROM sync_state WHERE scope = ?', [scope]);
  return row?.cursor ?? null;
}

/** Null while a full sync is incomplete: its prune needs every id, so an interrupted one restarts. */
export async function getResumeCursor(tx: Tx, scope: 'cal' | 'contact'): Promise<string | null> {
  const row = await tx.first<{ cursor: string | null; last_full_sync_at: string | null }>(
    'SELECT cursor, last_full_sync_at FROM sync_state WHERE scope = ?', [scope]);
  return row?.last_full_sync_at ? row.cursor : null;
}

export async function setCursor(tx: Tx, scope: 'cal' | 'contact', cursor: string, inFullSync: boolean, nowIso: string): Promise<void> {
  await tx.run(
    `INSERT INTO sync_state (scope, cursor, last_full_sync_at, last_delta_at) VALUES (?, ?, NULL, ?)
     ON CONFLICT(scope) DO UPDATE SET cursor=excluded.cursor,
       last_full_sync_at=CASE WHEN ? THEN NULL ELSE sync_state.last_full_sync_at END,
       last_delta_at=excluded.last_delta_at`,
    [scope, cursor, nowIso, inFullSync ? 1 : 0],
  );
}

export async function completeFullSync(tx: Tx, scope: 'cal' | 'contact', nowIso: string): Promise<void> {
  await tx.run('UPDATE sync_state SET last_full_sync_at = ? WHERE scope = ?', [nowIso, scope]);
}

export async function getMeta(tx: Tx, key: string): Promise<string | null> {
  const row = await tx.first<{ value: string }>('SELECT value FROM mirror_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(tx: Tx, key: string, value: string): Promise<void> {
  await tx.run('INSERT OR REPLACE INTO mirror_meta (key, value) VALUES (?, ?)', [key, value]);
}

export async function listContainerDocs<T>(tx: Tx, table: 'calendars' | 'address_books' | 'contact_groups'): Promise<T[]> {
  return (await tx.all<{ doc: string }>(`SELECT doc FROM ${table}`)).map((r) => JSON.parse(r.doc) as T);
}

export type { SqlValue };
