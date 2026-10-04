import type { Db } from './types';

/** Append-only migration ladder keyed on PRAGMA user_version. Each entry runs once, in order, inside an
 *  exclusive transaction. THE OUTBOX IS NEVER DROPPED — un-pushed offline writes must survive any upgrade
 *  (ops carry envelope_version so a future shape change can translate rather than wipe). New schema work =
 *  push another migration; never edit a shipped entry. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE items (
    id TEXT PRIMARY KEY,
    doc TEXT NOT NULL,
    guards TEXT NOT NULL,
    title TEXT,
    status TEXT,
    is_all_day INTEGER NOT NULL DEFAULT 0,
    start_utc TEXT,
    end_utc TEXT,
    recurrence_rule TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE item_calendars (
    item_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (item_id, calendar_id)
  );
  CREATE INDEX idx_item_calendars_calendar ON item_calendars (calendar_id);
  CREATE TABLE occurrences (
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    start_utc TEXT NOT NULL,
    end_utc TEXT,
    start_day TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source, source_id, start_utc)
  );
  CREATE INDEX idx_occurrences_day ON occurrences (start_day);
  CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    doc TEXT NOT NULL,
    guards TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    address_book_id TEXT NOT NULL,
    bday_year INTEGER,
    bday_month INTEGER,
    bday_day INTEGER,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE calendars (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
  CREATE TABLE address_books (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
  CREATE TABLE contact_groups (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id TEXT NOT NULL UNIQUE,
    envelope_version INTEGER NOT NULL,
    domain TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    last_error TEXT
  );
  CREATE INDEX idx_outbox_status ON outbox (status, seq);
  CREATE INDEX idx_outbox_aggregate ON outbox (aggregate_id, seq);
  CREATE TABLE sync_state (
    scope TEXT PRIMARY KEY,
    cursor TEXT,
    last_full_sync_at TEXT,
    last_delta_at TEXT
  );
  CREATE TABLE mirror_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  `
  CREATE TABLE photo_upload_queue (
    media_store_id TEXT PRIMARY KEY,
    asset_id TEXT,
    state TEXT NOT NULL DEFAULT 'pending',
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    taken_at TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    width INTEGER,
    height INTEGER,
    duration_seconds REAL,
    local_uri TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_photo_queue_state ON photo_upload_queue (state, next_attempt_at);
  `,
  `
  CREATE TABLE location_fix_queue (
    seq INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    accuracy_m REAL,
    altitude_m REAL,
    heading_deg REAL,
    speed_mps REAL,
    activity TEXT NOT NULL DEFAULT 'Unknown',
    provider TEXT NOT NULL DEFAULT 'Unknown',
    battery_pct INTEGER,
    is_moving INTEGER NOT NULL DEFAULT 0,
    is_mock INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT
  );
  CREATE INDEX idx_location_queue_due ON location_fix_queue (next_attempt_at, seq);
  `,
  // v4: relationships between contacts, a mirror of /sync/relationships (read-only here: no outbox ops).
  `
  CREATE TABLE relationships (
    id TEXT PRIMARY KEY,
    low_id TEXT NOT NULL,
    high_id TEXT NOT NULL,
    doc TEXT NOT NULL
  );
  CREATE INDEX idx_relationships_low ON relationships (low_id);
  CREATE INDEX idx_relationships_high ON relationships (high_id);
  `,
  // v5: residencies and per-place entry codes, mirrors of /sync/residencies and /sync/place-entries (read-only here).
  `
  CREATE TABLE residencies (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    place_id TEXT NOT NULL,
    doc TEXT NOT NULL
  );
  CREATE INDEX idx_residencies_contact ON residencies (contact_id);
  CREATE INDEX idx_residencies_place ON residencies (place_id);
  CREATE TABLE place_entries (
    place_id TEXT PRIMARY KEY,
    doc TEXT NOT NULL
  );
  `,
];

// Single-flight per db handle: bridge-store init and the first runSync both migrate on app start —
// on a virgin database both read user_version 0 and the loser hits "table items already exists".
const migrating = new WeakMap<Db, Promise<void>>();

export function migrate(db: Db, migrations: string[] = MIGRATIONS): Promise<void> {
  let inFlight = migrating.get(db);
  if (!inFlight) {
    inFlight = runMigrate(db, migrations).finally(() => migrating.delete(db));
    migrating.set(db, inFlight);
  }
  return inFlight;
}

async function runMigrate(db: Db, migrations: string[]): Promise<void> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  for (let v = from; v < migrations.length; v++) {
    // PRAGMA can't be parameterized and user_version must commit WITH the DDL, so both run via exec
    // inside one exclusive scope per step.
    await db.exclusive(async () => undefined);   // drain writers before DDL
    await db.exec(`${migrations[v]}\nPRAGMA user_version = ${v + 1};`);
  }
}
