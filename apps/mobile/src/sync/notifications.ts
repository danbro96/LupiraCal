import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { deleteMeta, getMeta, setMeta } from '@danbro96/lupira-sync-engine/metaStore';
import { isCalendarShown } from '@lupira/cal-domain/calendars';
import { deviceTimeZone } from '@lupira/cal-domain/zonedTime';
import type { NotificationPort } from '../data/notifications/port';
import {
  birthdaysBetween, calendarsForVisibility, myContactIdOf, myOccurrences, pendingInvites, shownOccurrences,
} from '../data/queries/notificationSources';
import { isManaged, planNotifications } from '../domain/notificationPlan';
import { NOTIFY_PREFIX, notifyPrefsFrom } from '../domain/notificationPrefs';
import { addDays, desiredReminders, HORIZON_DAYS, todayIn } from '../domain/reminders';
import { rsvpPrompts, seedAsked, staleRsvpPrompts, type AskedPrompts } from '../domain/rsvpPrompts';
import { CALENDAR_CHOICES_KEY } from './metaKeys';

/** Keeps the OS's scheduled notifications equal to what the mirror and the prefs ask for. Reads only the database
 *  and kernel meta, so the background sync task runs it headlessly too. */

export const NOTIFY_STATE = {
  asked: 'notify.asked',
  seeded: 'notify.seeded',
  exact: 'notify.exact',
  permissionAsked: 'notify.permissionAsked',
} as const;
export const HANDLED_PREFIX = 'notify.handled.';

const DEBOUNCE_MS = 2_000;
const REARM_MS = 2 * 3_600_000;
const HANDLED_TTL_MS = 30 * 86_400_000;
// Multi-day trips and stays that began this long before today still show in its summary.
const SPAN_LOOKBACK_DAYS = 31;

export type NotifierDeps = {
  db: () => Promise<Db>;
  port: NotificationPort;
  now?: () => Date;
  zone?: () => string;
  debounceMs?: number;
  onError?: (e: unknown) => void;
};

export type Notifier = {
  /** Runs now; a call during a run is folded into one more pass after it. */
  reconcile(): Promise<void>;
  /** Debounced reconcile: a burst of changes reconciles once. */
  schedule(): void;
  /** Channels and the action buttons, then the permission prompt the first time only, then a reconcile. */
  prepare(): Promise<void>;
  /** Clears everything this app scheduled or shows and forgets what was asked: another account signed in. */
  cancelAll(): Promise<void>;
};

export function createNotifier(deps: NotifierDeps): Notifier {
  let running: Promise<void> | null = null;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const reconcile = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await reconcileOnce(deps);
        } while (again);
      } catch (e) {
        deps.onError?.(e);
      } finally {
        running = null;
      }
    })();
    return running;
  };

  return {
    reconcile,
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void reconcile();
      }, deps.debounceMs ?? DEBOUNCE_MS);
    },
    async prepare() {
      try {
        await deps.port.setUp();
        const db = await deps.db();
        if (!(await getMeta(db, NOTIFY_STATE.permissionAsked))) {
          await db.exclusive((tx) => setMeta(tx, NOTIFY_STATE.permissionAsked, '1'));
          await deps.port.requestPermission();
        }
      } catch (e) {
        deps.onError?.(e);
      }
      await reconcile();
    },
    async cancelAll() {
      if (timer) clearTimeout(timer);
      timer = null;
      await running;
      const { port } = deps;
      for (const s of await port.scheduled()) if (isManaged(s.id)) await port.cancel(s.id);
      for (const id of await port.presented()) if (isManaged(id)) await port.dismiss(id);
      await (await deps.db()).exclusive(async (tx) => {
        await deleteMeta(tx, NOTIFY_STATE.asked);
        await deleteMeta(tx, NOTIFY_STATE.seeded);
        await tx.run('DELETE FROM meta WHERE key LIKE ?', [`${HANDLED_PREFIX}%`]);
      });
    },
  };
}

async function reconcileOnce({ db: openDb, port, now: clock, zone: zoneOf }: NotifierDeps): Promise<void> {
  if ((await port.permission()) !== 'granted') return;
  const db = await openDb();
  const now = clock?.() ?? new Date();
  const zone = zoneOf?.() ?? deviceTimeZone() ?? 'UTC';
  const prefs = notifyPrefsFrom(await metaWithPrefix(db, NOTIFY_PREFIX));
  const ctx = { now, zone, prefs };
  const me = await myContactIdOf(db);
  const today = todayIn(now, zone);
  const toDay = addDays(today, HORIZON_DAYS + 1);

  const choices = parseRecord<boolean>(await getMeta(db, CALENDAR_CHOICES_KEY));
  const shownIds = (await calendarsForVisibility(db)).filter((c) => isCalendarShown(c, choices)).map((c) => c.id);
  const desired = desiredReminders({
    mine: me ? await myOccurrences(db, me, addDays(today, -1), toDay) : [],
    shown: prefs.morningSummary ? await shownOccurrences(db, addDays(today, -SPAN_LOOKBACK_DAYS), toDay, shownIds, me) : [],
    birthdays: prefs.birthdays ? await birthdaysBetween(db, addDays(today, -1), toDay) : [],
  }, ctx);

  const invites = me ? await pendingInvites(db, me, today, now.toISOString()) : [];
  const stored: AskedPrompts = parseRecord<string>(await getMeta(db, NOTIFY_STATE.asked));
  const seeded = (await getMeta(db, NOTIFY_STATE.seeded)) !== null;
  const rsvp = me
    ? rsvpPrompts(invites, seeded ? stored : seedAsked(invites, stored, now), me, ctx)
    : { present: [], schedule: [], asked: stored };

  const exact = await port.canScheduleExact();
  const wasExact = await getMeta(db, NOTIFY_STATE.exact);
  const plan = planNotifications([...desired, ...rsvp.schedule], await port.scheduled(), {
    now,
    rebuild: wasExact !== null && wasExact !== flag(exact),
    rearmBefore: exact ? null : new Date(now.getTime() + REARM_MS),
  });
  for (const id of plan.cancel) await port.cancel(id);
  for (const n of plan.schedule) await port.schedule(n);
  for (const n of rsvp.present) await port.present(n);
  for (const id of staleRsvpPrompts(await port.presented(), invites)) await port.dismiss(id);

  await db.exclusive(async (tx) => {
    await setMeta(tx, NOTIFY_STATE.asked, JSON.stringify(rsvp.asked));
    if (me) await setMeta(tx, NOTIFY_STATE.seeded, '1');
    await setMeta(tx, NOTIFY_STATE.exact, flag(exact));
    await tx.run('DELETE FROM meta WHERE key LIKE ? AND value < ?', [`${HANDLED_PREFIX}%`, new Date(now.getTime() - HANDLED_TTL_MS).toISOString()]);
  });
}

const flag = (on: boolean) => (on ? '1' : '0');

async function metaWithPrefix(db: Db, prefix: string): Promise<Record<string, string>> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM meta WHERE key LIKE ?', [`${prefix}%`]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function parseRecord<T>(raw: string | null): Record<string, T> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, T>) : {};
  } catch {
    return {};
  }
}
