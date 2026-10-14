import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { Aggregate } from '../../domain/aggregates';
import type { ItemDoc, ReminderMode } from '../../domain/docTypes';
import type { BirthdayOccurrence, MyOccurrence, ShownOccurrence } from '../../domain/reminders';
import { inviterOf, type PendingInvite } from '../../domain/rsvpPrompts';
import { inShownCalendars } from './calendarFilter';

/** The mirror reads the notification reconciler plans from; they run headlessly too, so nothing here may need
 *  more than the database. */

export async function myContactIdOf(tx: Tx): Promise<string | null> {
  const row = await tx.first<{ contact_id: string | null }>(
    `SELECT json_extract(local, '$.doc.contactId') AS contact_id FROM docs WHERE aggregate = '${Aggregate.me}' AND local IS NOT NULL LIMIT 1`);
  return row?.contact_id ?? null;
}

export type CalendarVisibility = { id: string; class: string | null; kind: string | null };

export async function calendarsForVisibility(tx: Tx): Promise<CalendarVisibility[]> {
  return tx.all<CalendarVisibility>(
    `SELECT id, json_extract(local, '$.doc.class') AS class, json_extract(local, '$.doc.kind') AS kind
     FROM docs WHERE aggregate = '${Aggregate.calendar}' AND local IS NOT NULL`);
}

type OccurrenceRow = {
  item_id: string; original_start: string | null; title: string | null; item_status: string | null; all_day: number;
  start_utc: string; end_utc: string | null; start_day: string;
};

/** An occurrence's columns, read as that occurrence (its own title and status over the item's). */
const OCCURRENCE = `o.item_id, o.original_start, COALESCE(o.title, i.title) AS title, COALESCE(o.status, i.status) AS item_status,
            o.all_day, o.start_utc, o.end_utc, o.start_day`;

/** Occurrences of the items you're on, with your RSVP and reminder. */
export async function myOccurrences(tx: Tx, contactId: string, fromDay: string, toDay: string): Promise<MyOccurrence[]> {
  const rows = await tx.all<OccurrenceRow & { place: string | null; rsvp: string; reminder_mode: string | null; reminder_minutes: number | null }>(
    `SELECT ${OCCURRENCE}, i.location_label AS place, a.status AS rsvp, a.reminder_mode, a.reminder_minutes
     FROM item_occurrences o
     JOIN item_attendees a ON a.item_id = o.item_id AND a.contact_id = ?
     JOIN item_index i ON i.id = o.item_id
     WHERE o.start_day >= ? AND o.start_day <= ?`,
    [contactId, fromDay, toDay],
  );
  return rows.map((r) => ({
    ...occurrenceOf(r),
    place: r.place,
    rsvp: r.rsvp,
    reminder: r.reminder_mode ? { mode: r.reminder_mode as ReminderMode, minutesBefore: r.reminder_minutes } : null,
  }));
}

/** Occurrences in shown calendars that start in the range, never availability entries; `rsvp` is yours. */
export async function shownOccurrences(tx: Tx, fromDay: string, toDay: string, calendarIds: string[], contactId: string | null): Promise<ShownOccurrence[]> {
  const rows = await tx.all<OccurrenceRow & { rsvp: string | null }>(
    `SELECT ${OCCURRENCE},
            (SELECT a.status FROM item_attendees a WHERE a.item_id = o.item_id AND a.contact_id = ?) AS rsvp
     FROM item_occurrences o
     JOIN item_index i ON i.id = o.item_id
     WHERE o.start_day >= ? AND o.start_day <= ? AND ${inShownCalendars('o.item_id')}
       AND NOT EXISTS (SELECT 1 FROM item_calendars ia JOIN calendar_index ca ON ca.id = ia.calendar_id
                       WHERE ia.item_id = o.item_id AND ca.kind = 'Availability')`,
    [contactId, fromDay, toDay, JSON.stringify(calendarIds)],
  );
  return rows.map((r) => ({ ...occurrenceOf(r), rsvp: r.rsvp }));
}

export async function birthdaysBetween(tx: Tx, fromDay: string, toDay: string): Promise<BirthdayOccurrence[]> {
  const rows = await tx.all<{ contact_id: string; display_name: string; start_day: string; birth_year: number | null }>(
    `SELECT b.contact_id, c.display_name, b.start_day, json_extract(d.local, '$.doc.birthday.year') AS birth_year
     FROM birthday_occurrences b
     JOIN contact_index c ON c.id = b.contact_id
     JOIN docs d ON d.aggregate = '${Aggregate.contact}' AND d.id = b.contact_id AND d.local IS NOT NULL
     WHERE b.start_day >= ? AND b.start_day <= ? AND COALESCE(json_extract(d.local, '$.doc.deceased'), 0) = 0`,
    [fromDay, toDay],
  );
  return rows.map((r) => ({ contactId: r.contact_id, name: r.display_name, day: r.start_day, birthYear: r.birth_year }));
}

/** Items waiting on your reply, each with its next occurrence still ahead (null when none is). */
export async function pendingInvites(tx: Tx, contactId: string, today: string, nowIso: string): Promise<PendingInvite[]> {
  const rows = await tx.all<{ id: string; title: string | null; status: string | null; is_all_day: number; local: string; next_start_utc: string | null }>(
    `SELECT i.id, i.title, i.status, i.is_all_day, d.local,
            (SELECT o.start_utc FROM item_occurrences o
             WHERE o.item_id = i.id AND ((o.all_day = 1 AND o.start_day >= ?) OR (o.all_day = 0 AND o.start_utc > ?))
             ORDER BY o.start_utc LIMIT 1) AS next_start_utc
     FROM item_attendees a
     JOIN item_index i ON i.id = a.item_id
     JOIN docs d ON d.aggregate = '${Aggregate.item}' AND d.id = i.id AND d.local IS NOT NULL
     WHERE a.contact_id = ? AND a.status = 'NeedsAction'`,
    [today, nowIso, contactId],
  );
  const docs = rows.map((r) => (JSON.parse(r.local) as { doc: ItemDoc }).doc);
  const inviters = docs.map((doc) => inviterOf(doc.attendees ?? [], contactId));
  const names = await contactNames(tx, inviters.filter((id): id is string => id !== null));
  return rows.map((r, i) => {
    const mine = docs[i].attendees?.find((a) => a.contactId === contactId) as { invitedAt?: string | null } | undefined;
    const inviter = inviters[i];
    return {
      itemId: r.id,
      title: r.title,
      itemStatus: r.status,
      allDay: r.is_all_day === 1,
      nextStartUtc: r.next_start_utc,
      nextStartDay: r.next_start_utc && r.is_all_day === 1 ? r.next_start_utc.slice(0, 10) : null,
      invitedAt: mine?.invitedAt ?? null,
      inviter: inviter ? (names.get(inviter) ?? null) : null,
    };
  });
}

async function contactNames(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.all<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM contact_index WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify([...new Set(ids)])]);
  return new Map(rows.map((r) => [r.id, r.display_name]));
}

function occurrenceOf(r: OccurrenceRow) {
  return {
    itemId: r.item_id, originalStart: r.original_start, title: r.title, itemStatus: r.item_status, allDay: r.all_day === 1,
    startUtc: r.start_utc, endUtc: r.end_utc, startDay: r.start_day,
  };
}
