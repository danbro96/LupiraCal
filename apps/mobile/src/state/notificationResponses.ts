import { toast } from '@danbro96/lupira-expo-feedback/toast';
import { RSVP_LABELS } from '@lupira/cal-domain/participation';
import { expoNotificationPort, type NotificationTap } from '../data/notifications/port';
import { Aggregate } from '../domain/aggregates';
import type { ItemDoc, ItemGuards } from '../domain/docTypes';
import { parseRsvpKey, rsvpStatusOf } from '../domain/rsvpPrompts';
import { engine } from '../sync/engine';
import { readMeta, writeMeta } from '../sync/meta';
import { HANDLED_PREFIX } from '../sync/notifications';
import { setRsvp } from './actions';
import { loadMyContactId } from './useMe';

export const NOTIFICATION_TASK = 'lupira-calendar-notification';

export type TapOutcome = 'answered' | 'duplicate' | 'dropped' | 'ignored';

/** An RSVP button on a prompt, from the foreground listener or the background task — both may see the same tap, and
 *  a cold start can replay it, so each is acted on once. A prompt meant for another account, or for an event you're no
 *  longer on, is only taken down. */
export async function respondToNotification(tap: NotificationTap): Promise<TapOutcome> {
  const status = rsvpStatusOf(tap.action);
  const prompt = parseRsvpKey(tap.id);
  if (!status || !prompt) return 'ignored';
  const handled = `${HANDLED_PREFIX}${tap.id}@${tap.date}:${tap.action}`;
  if (await readMeta(handled)) return 'duplicate';
  await writeMeta(handled, new Date().toISOString());
  await expoNotificationPort.dismiss(tap.id);

  const me = await loadMyContactId();
  const item = await engine.doc<ItemDoc, ItemGuards>(Aggregate.item, prompt.itemId);
  const onIt = !!me && !!item?.doc.attendees?.some((a) => a.contactId === me);
  if (!me || tap.data.contactId !== me || !onIt) return 'dropped';
  await setRsvp(prompt.itemId, me, status);
  const title = item?.doc.title;
  toast(title ? `${RSVP_LABELS[status]} · ${title}` : RSVP_LABELS[status]);
  await engine.push();
  return 'answered';
}
