import { RSVP_LABELS } from '@lupira/cal-domain/participation';
import type { ItemAttendee } from './docTypes';
import type { DesiredNotification } from './notificationPlan';
import type { RsvpStatus } from './ops';
import { addDays, HORIZON_DAYS, itemUrl, todayIn, UNTITLED, wallFire, whenLabel, type NotifyContext } from './reminders';

/** Asking you to reply to invitations you haven't answered: once when invited, and once before it starts. */

/** An item you're invited to with no reply yet; `next*` is its next occurrence, null when none is ahead. */
export type PendingInvite = {
  itemId: string;
  title: string | null;
  itemStatus: string | null;
  allDay: boolean;
  nextStartUtc: string | null;
  nextStartDay: string | null;
  invitedAt: string | null;
  inviter: string | null;
};

export type RsvpPromptKind = 'invited' | 'beforeStart';

/** Prompt key → when it was shown or is due. A due time in the past means it went out: a series asks once. */
export type AskedPrompts = Record<string, string>;

export type RsvpRun = { present: DesiredNotification[]; schedule: DesiredNotification[]; asked: AskedPrompts };

export const rsvpKey = (itemId: string, kind: RsvpPromptKind) => `rsvp:${itemId}:${kind}`;

export function parseRsvpKey(id: string): { itemId: string; kind: RsvpPromptKind } | null {
  const [prefix, itemId, kind] = id.split(':');
  return prefix === 'rsvp' && itemId && (kind === 'invited' || kind === 'beforeStart') ? { itemId, kind } : null;
}

export const INVITE_WINDOW_MS = 48 * 3_600_000;
export const MAX_INVITE_PROMPTS = 5;
const ALL_DAY_ASK_AT = '18:00';

export const RSVP_ACTIONS: readonly { status: RsvpStatus; title: string }[] = [
  { status: 'Accepted', title: RSVP_LABELS.Accepted },
  { status: 'Tentative', title: RSVP_LABELS.Tentative },
  { status: 'Declined', title: RSVP_LABELS.Declined },
];

export function rsvpStatusOf(actionIdentifier: string): RsvpStatus | null {
  return RSVP_ACTIONS.find((a) => a.status === actionIdentifier)?.status ?? null;
}

/** Who asked: the organiser, unless that's you. */
export function inviterOf(attendees: readonly ItemAttendee[], me: string): string | null {
  return attendees.find((a) => a.role === 'Chair' && a.contactId !== me)?.contactId ?? null;
}

/** Marks every current invitation as asked, so turning prompts on never sends a backlog. */
export function seedAsked(invites: readonly PendingInvite[], asked: AskedPrompts, now: Date): AskedPrompts {
  const seeded = { ...asked };
  for (const i of invites) seeded[rsvpKey(i.itemId, 'invited')] ??= now.toISOString();
  return seeded;
}

function upcoming(i: PendingInvite, now: Date, today: string): boolean {
  if (i.itemStatus === 'Cancelled' || !i.nextStartUtc) return false;
  return i.allDay ? !!i.nextStartDay && i.nextStartDay >= today : Date.parse(i.nextStartUtc) > now.getTime();
}

export function rsvpPrompts(invites: readonly PendingInvite[], asked: AskedPrompts, me: string, ctx: NotifyContext): RsvpRun {
  const { now, zone, prefs } = ctx;
  const today = todayIn(now, zone);
  const nowIso = now.toISOString();
  const until = now.getTime() + HORIZON_DAYS * 86_400_000;
  const live = new Set(invites.map((i) => i.itemId));
  const next: AskedPrompts = Object.fromEntries(Object.entries(asked).filter(([key]) => live.has(parseRsvpKey(key)?.itemId ?? '')));
  const prompt = (i: PendingInvite, kind: RsvpPromptKind, fireAt: string, title: string, body: string): DesiredNotification => ({
    id: rsvpKey(i.itemId, kind),
    fireAt,
    channel: 'rsvp',
    title,
    body,
    data: { url: itemUrl(i.itemId), itemId: i.itemId, contactId: me },
    category: 'rsvp',
  });

  const present: DesiredNotification[] = [];
  const fresh = invites
    .filter((i) => upcoming(i, now, today) && !next[rsvpKey(i.itemId, 'invited')] && !!i.invitedAt
      && now.getTime() - Date.parse(i.invitedAt) <= INVITE_WINDOW_MS)
    .sort((a, b) => Date.parse(a.invitedAt!) - Date.parse(b.invitedAt!));
  if (!prefs.askWhenInvited) Object.assign(next, seedAsked(invites, next, now));
  else {
    for (const i of fresh.slice(0, MAX_INVITE_PROMPTS)) {
      next[rsvpKey(i.itemId, 'invited')] = nowIso;
      const when = whenLabel({ allDay: i.allDay, startUtc: i.nextStartUtc!, startDay: i.nextStartDay ?? '' }, now.getTime(), zone);
      present.push(prompt(i, 'invited', nowIso, i.inviter ? `${i.inviter} invited you` : 'You’re invited', `${i.title || UNTITLED} · ${when}`));
    }
  }

  const schedule: DesiredNotification[] = [];
  for (const i of invites) {
    const key = rsvpKey(i.itemId, 'beforeStart');
    const due = next[key];
    if (due && Date.parse(due) <= now.getTime()) continue;
    delete next[key];
    if (!prefs.remindToReply || !upcoming(i, now, today)) continue;
    const fire = i.allDay
      ? wallFire(addDays(i.nextStartDay!, -1), ALL_DAY_ASK_AT, zone)
      : Date.parse(i.nextStartUtc!) - prefs.replyLeadMinutes * 60_000;
    if (fire <= now.getTime() || fire > until) continue;
    const fireAt = new Date(fire).toISOString();
    next[key] = fireAt;
    const when = whenLabel({ allDay: i.allDay, startUtc: i.nextStartUtc!, startDay: i.nextStartDay ?? '' }, fire, zone);
    schedule.push(prompt(i, 'beforeStart', fireAt, `Going to ${i.title || UNTITLED}?`, `${when} · You haven’t replied`));
  }
  return { present, schedule, asked: next };
}

/** Prompts still on screen for invitations answered elsewhere, cancelled or gone. */
export function staleRsvpPrompts(presentedIds: readonly string[], invites: readonly PendingInvite[]): string[] {
  const open = new Set(invites.filter((i) => i.itemStatus !== 'Cancelled').map((i) => i.itemId));
  return presentedIds.filter((id) => {
    const key = parseRsvpKey(id);
    return key !== null && !open.has(key.itemId);
  });
}
