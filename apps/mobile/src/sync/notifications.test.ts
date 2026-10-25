import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { getMeta, setMeta } from '@danbro96/lupira-sync-engine/metaStore';
import { KERNEL_MIGRATIONS } from '@danbro96/lupira-sync-engine/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALENDAR_DDL, writeCalendarIndex } from '../data/indexes/calendars';
import { CONTACT_DDL, writeContactIndex } from '../data/indexes/contacts';
import { ITEM_DDL, writeItemIndex } from '../data/indexes/items';
import type { NotificationPermission, NotificationPort } from '../data/notifications/port';
import { putDoc } from '../data/queries/testDocs';
import { Aggregate } from '../domain/aggregates';
import type { ItemAttendee, ItemDoc } from '../domain/docTypes';
import { emptyContactGuards, emptyItemGuards } from '../domain/docTypes';
import type { DesiredNotification, PlannedNotification } from '../domain/notificationPlan';
import { notifyPrefKey } from '../domain/notificationPrefs';
import { createNotifier, HANDLED_PREFIX, NOTIFY_STATE } from './notifications';

const ZONE = 'Europe/Stockholm';
let db: Db;

function fakeOs() {
  const scheduled = new Map<string, PlannedNotification>();
  const presented = new Map<string, DesiredNotification>();
  const os = { permission: 'granted' as NotificationPermission, exact: true, scheduledCalls: 0, permissionReads: 0, permissionRequests: 0 };
  const port: NotificationPort = {
    setUp: async () => {},
    requestPermission: async () => {
      os.permissionRequests++;
      return os.permission;
    },
    permission: async () => {
      os.permissionReads++;
      return os.permission;
    },
    canScheduleExact: async () => os.exact,
    scheduled: async () => [...scheduled.values()].map((n) => ({ id: n.id, sig: n.sig })),
    schedule: async (n) => {
      os.scheduledCalls++;
      scheduled.set(n.id, n);
    },
    present: async (n) => void presented.set(n.id, n),
    cancel: async (id) => void scheduled.delete(id),
    presented: async () => [...presented.keys()],
    dismiss: async (id) => void presented.delete(id),
  };
  return { os, port, scheduled, presented };
}

let os: ReturnType<typeof fakeOs>;
const notifier = () => createNotifier({ db: async () => db, port: os.port, zone: () => ZONE, debounceMs: 2000 });

const on = (contactId: string, over: Partial<ItemAttendee> & Record<string, unknown> = {}): ItemAttendee =>
  ({ participationId: `p-${contactId}`, contactId, role: 'RequiredParticipant', status: 'Accepted', ...over });

const putItem = (id: string, startsAt: string, attendees: ItemAttendee[], over: Partial<ItemDoc> = {}) =>
  db.exclusive((tx) => putDoc(tx, Aggregate.item, id, {
    doc: { id, title: id, isAllDay: false, startsAt, endsAt: null, calendars: [{ calendarId: 'personal', status: 'Accepted' }], attendees, ...over },
    guards: emptyItemGuards(),
  }, writeItemIndex));

const setPref = (key: string, value: string) => db.exclusive((tx) => setMeta(tx, key, value));
const ids = () => [...os.scheduled.keys()].sort();

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-10-13T12:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  db = openNodeDb();
  await migrate(db, KERNEL_MIGRATIONS);
  await db.exec(ITEM_DDL + CONTACT_DDL + CALENDAR_DDL);
  os = fakeOs();
  await db.exclusive(async (tx) => {
    await tx.run('INSERT INTO docs (aggregate, id, local) VALUES (?, ?, ?)', [Aggregate.me, 'me', JSON.stringify({ doc: { contactId: 'me' } })]);
    await putDoc(tx, Aggregate.calendar, 'personal', { doc: { id: 'personal', kind: 'Personal', class: 'Agenda', access: 'Owner' }, guards: null }, writeCalendarIndex);
    await putDoc(tx, Aggregate.contact, 'anna', {
      doc: { id: 'anna', addressBookId: 'ab', givenName: 'Anna', birthday: { year: 1986, month: 10, day: 15 } }, guards: emptyContactGuards(),
    }, writeContactIndex);
  });
});

afterEach(() => vi.useRealTimers());

describe('reconcileNotifications', () => {
  it('schedules reminders and digests from the mirror and leaves them alone when nothing changed', async () => {
    await putItem('dentist', '2026-10-14T09:00:00.000Z', [on('me')]);
    const n = notifier();
    await n.reconcile();

    expect(ids()).toEqual(['cal:bday:2026-10-15', 'cal:day:2026-10-14', 'cal:rem:dentist:2026-10-14T09:00:00.000Z']);
    expect(os.scheduled.get('cal:rem:dentist:2026-10-14T09:00:00.000Z')?.fireAt).toBe('2026-10-14T08:45:00.000Z');
    const calls = os.os.scheduledCalls;
    await n.reconcile();
    expect(os.os.scheduledCalls).toBe(calls);
  });

  it('follows the prefs in meta and the reminder you set', async () => {
    await putItem('dentist', '2026-10-14T09:00:00.000Z', [on('me', { reminder: { mode: 'Off', minutesBefore: null } })]);
    await setPref(notifyPrefKey('morningSummary'), '0');
    await setPref(notifyPrefKey('birthdays'), '0');
    await notifier().reconcile();

    expect(ids()).toEqual([]);
  });

  it('cancels what the mirror no longer holds', async () => {
    await putItem('dentist', '2026-10-14T09:00:00.000Z', [on('me')]);
    const n = notifier();
    await n.reconcile();
    await db.exclusive(async (tx) => {
      await tx.run("UPDATE docs SET local = NULL WHERE id = 'dentist'");
      await writeItemIndex(tx, 'dentist', null);
    });
    await n.reconcile();

    expect(ids()).toEqual(['cal:bday:2026-10-15']);
  });

  it('seeds the invitations waiting on the first run, then asks about new ones once', async () => {
    const invited = (at: string) => [on('me', { status: 'NeedsAction', invitedAt: at }), on('anna', { role: 'Chair' })];
    await putItem('old', '2026-10-20T16:00:00.000Z', invited('2026-10-13T11:00:00Z'));
    const n = notifier();
    await n.reconcile();
    expect([...os.presented.keys()]).toEqual([]);

    await putItem('new', '2026-10-21T16:00:00.000Z', invited('2026-10-13T11:30:00Z'));
    await n.reconcile();
    await n.reconcile();
    expect([...os.presented.values()].map((p) => [p.id, p.title, p.data.contactId])).toEqual([['rsvp:new:invited', 'Anna invited you', 'me']]);
    expect(ids()).toContain('rsvp:new:beforeStart');
  });

  it('takes a prompt down once the invitation is answered elsewhere', async () => {
    await setPref(NOTIFY_STATE.seeded, '1');
    await putItem('party', '2026-10-20T16:00:00.000Z', [on('me', { status: 'NeedsAction', invitedAt: '2026-10-13T11:00:00Z' })]);
    const n = notifier();
    await n.reconcile();
    expect([...os.presented.keys()]).toEqual(['rsvp:party:invited']);
    expect(ids()).toContain('rsvp:party:beforeStart');

    await putItem('party', '2026-10-20T16:00:00.000Z', [on('me', { status: 'Declined' })]);
    await n.reconcile();
    expect([...os.presented.keys()]).toEqual([]);
    expect(ids()).not.toContain('rsvp:party:beforeStart');
  });

  it('does nothing without the permission', async () => {
    os.os.permission = 'denied';
    await putItem('dentist', '2026-10-14T09:00:00.000Z', [on('me')]);
    await notifier().reconcile();
    expect(ids()).toEqual([]);
  });

  it('sets everything again when exact alarms come or go, and re-arms near fires while inexact', async () => {
    await putItem('soon', '2026-10-13T13:30:00.000Z', [on('me')]);
    await putItem('later', '2026-10-14T09:00:00.000Z', [on('me')]);
    const n = notifier();
    await n.reconcile();
    const first = os.os.scheduledCalls;

    os.os.exact = false;
    await n.reconcile();
    expect(os.os.scheduledCalls - first).toBe(4);

    const second = os.os.scheduledCalls;
    await n.reconcile();
    expect(os.os.scheduledCalls - second).toBe(1);
  });

  it('runs once for a burst of changes, two seconds after the last', async () => {
    const n = notifier();
    n.schedule();
    await vi.advanceTimersByTimeAsync(1500);
    n.schedule();
    n.schedule();
    await vi.advanceTimersByTimeAsync(1999);
    expect(os.os.permissionReads).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(os.os.permissionReads).toBe(1));
  });

  it('folds calls during a run into one more pass', async () => {
    const n = notifier();
    await Promise.all([n.reconcile(), n.reconcile(), n.reconcile()]);
    expect(os.os.permissionReads).toBe(2);
  });

  it('asks for the permission only the first time', async () => {
    await notifier().prepare();
    await notifier().prepare();
    expect(os.os.permissionRequests).toBe(1);
  });

  it('clears its own notifications and what it asked when another account signs in', async () => {
    await putItem('dentist', '2026-10-14T09:00:00.000Z', [on('me')]);
    os.presented.set('other', { id: 'other', fireAt: '', channel: 'reminders', title: '', body: '', data: { url: '' } });
    await setPref(`${HANDLED_PREFIX}rsvp:x:invited@1:Accepted`, '2026-10-13T00:00:00Z');
    const n = notifier();
    await n.reconcile();
    await n.cancelAll();

    expect([ids(), [...os.presented.keys()]]).toEqual([[], ['other']]);
    expect(await getMeta(db, NOTIFY_STATE.seeded)).toBeNull();
    expect(await getMeta(db, `${HANDLED_PREFIX}rsvp:x:invited@1:Accepted`)).toBeNull();
  });
});
