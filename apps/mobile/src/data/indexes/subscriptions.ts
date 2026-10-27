import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import type { SubscribedEventDoc } from '../../domain/docTypes';
import { occurrenceDay } from '../../domain/materialize';
import { insertChunked } from './items';

export const SUBSCRIBED_TABLES = ['subscribed_occurrences'];

export const SUBSCRIBED_DDL = `
  CREATE TABLE subscribed_occurrences (
    event_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    original_start TEXT,
    start_utc TEXT NOT NULL,
    end_utc TEXT,
    start_day TEXT NOT NULL,
    all_day INTEGER NOT NULL,
    title TEXT NOT NULL,
    location TEXT,
    color TEXT,
    status TEXT NOT NULL
  );
  CREATE INDEX subscribed_occurrences_event ON subscribed_occurrences (event_id, start_utc);
  CREATE INDEX subscribed_occurrences_day ON subscribed_occurrences (start_day);
`;

/** The server expands the series over its sync window, so each write replaces the event's rows wholesale. */
export async function writeSubscribedIndex(tx: Tx, id: string, state: { doc: SubscribedEventDoc } | null): Promise<void> {
  await tx.run('DELETE FROM subscribed_occurrences WHERE event_id = ?', [id]);
  const e = state?.doc;
  if (!e) return;
  await insertChunked(tx, `INSERT INTO subscribed_occurrences (event_id, subscription_id, calendar_id, original_start, start_utc, end_utc,
       start_day, all_day, title, location, color, status)`, 12,
  e.occurrences.flatMap((o) => {
    const start = new Date(o.start);
    if (Number.isNaN(start.getTime())) return [];
    const end = o.end ? Date.parse(o.end) : null;
    return [[id, e.subscriptionId, e.calendarId, o.originalStart ?? null, start.toISOString(),
      end !== null && end > start.getTime() ? new Date(end).toISOString() : null,
      occurrenceDay(start, e.isAllDay), e.isAllDay ? 1 : 0, e.title, e.locationLabel ?? null, e.color ?? null, e.status]];
  }));
}
