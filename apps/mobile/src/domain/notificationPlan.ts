/** Local notifications as desired state: the reconciler diffs what should be scheduled against what the OS holds
 *  and touches only the difference, under ids it owns. */

export type NotificationChannel = 'reminders' | 'daily' | 'rsvp';

export type DesiredNotification = {
  id: string;
  fireAt: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  /** `url` is the deep link a tap opens. */
  data: { url: string; itemId?: string; contactId?: string };
  category?: 'rsvp';
};

export type ScheduledNotification = { id: string; sig: string | null };

export type PlannedNotification = DesiredNotification & { sig: string };

export type NotificationPlan = { cancel: string[]; schedule: PlannedNotification[] };

export const MANAGED_PREFIXES = ['cal:', 'rsvp:'] as const;

// Android caps an app's pending alarms (500 on most OEMs, fewer on some); the nearest ones matter.
export const SCHEDULE_CAP = 100;

export const isManaged = (id: string) => MANAGED_PREFIXES.some((p) => id.startsWith(p));

/** FNV-1a over everything a notification shows and when, so a changed one is rescheduled and an unchanged one left. */
export function notificationSig(n: DesiredNotification): string {
  const text = JSON.stringify([n.fireAt, n.channel, n.title, n.body, n.data, n.category ?? null]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export type PlanOptions = {
  now: Date;
  /** Everything is rescheduled: alarms set under the other exact-alarm mode must be set again. */
  rebuild?: boolean;
  /** Without exact alarms, fires before this instant are set again on every run so a drifted one is re-armed. */
  rearmBefore?: Date | null;
};

export function planNotifications(desired: readonly DesiredNotification[], scheduled: readonly ScheduledNotification[], options: PlanOptions): NotificationPlan {
  const now = options.now.getTime();
  const seen = new Set<string>();
  const kept = desired
    .filter((d) => isManaged(d.id) && Date.parse(d.fireAt) > now)
    .sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((d) => !seen.has(d.id) && !!seen.add(d.id))
    .slice(0, SCHEDULE_CAP);
  const held = new Map(scheduled.filter((s) => isManaged(s.id)).map((s) => [s.id, s]));
  const rearm = options.rearmBefore?.getTime() ?? null;

  const cancel: string[] = [];
  const schedule: PlannedNotification[] = [];
  for (const d of kept) {
    const sig = notificationSig(d);
    const existing = held.get(d.id);
    const stale = options.rebuild || !existing || existing.sig !== sig || (rearm !== null && Date.parse(d.fireAt) < rearm);
    if (!stale) continue;
    if (existing) cancel.push(d.id);
    schedule.push({ ...d, sig });
  }
  const keptIds = new Set(kept.map((d) => d.id));
  for (const id of held.keys()) if (!keptIds.has(id)) cancel.push(id);
  return { cancel, schedule };
}
