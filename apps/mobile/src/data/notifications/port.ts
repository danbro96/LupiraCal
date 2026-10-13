import * as Notifications from 'expo-notifications';
import { LupiraBridge } from '../../../modules/lupira-bridge/src';
import type { DesiredNotification, PlannedNotification, ScheduledNotification } from '../../domain/notificationPlan';
import { requestNotificationPermission, setUpNotificationChannels } from './setup';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

/** What the reconciler needs from the OS; tests hand in a fake. */
export interface NotificationPort {
  setUp(): Promise<void>;
  requestPermission(): Promise<NotificationPermission>;
  permission(): Promise<NotificationPermission>;
  canScheduleExact(): Promise<boolean>;
  scheduled(): Promise<ScheduledNotification[]>;
  schedule(n: PlannedNotification): Promise<void>;
  /** Shows it now. */
  present(n: DesiredNotification): Promise<void>;
  cancel(id: string): Promise<void>;
  presented(): Promise<string[]>;
  dismiss(id: string): Promise<void>;
}

const contentOf = (n: DesiredNotification, sig: string | null): Notifications.NotificationContentInput => ({
  title: n.title,
  body: n.body,
  data: sig ? { ...n.data, sig } : { ...n.data },
  ...(n.category ? { categoryIdentifier: n.category } : {}),
});

export const expoNotificationPort: NotificationPort = {
  setUp: setUpNotificationChannels,
  requestPermission: requestNotificationPermission,
  permission: async () => (await Notifications.getPermissionsAsync()).status as NotificationPermission,
  canScheduleExact: () => LupiraBridge.canScheduleExactAlarms(),
  scheduled: async () => (await Notifications.getAllScheduledNotificationsAsync()).map((r) => ({
    id: r.identifier,
    sig: typeof r.content.data?.sig === 'string' ? r.content.data.sig : null,
  })),
  schedule: async (n) => {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: contentOf(n, n.sig),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.parse(n.fireAt), channelId: n.channel },
    });
  },
  present: async (n) => {
    await Notifications.scheduleNotificationAsync({ identifier: n.id, content: contentOf(n, null), trigger: { channelId: n.channel } });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
  presented: async () => (await Notifications.getPresentedNotificationsAsync()).map((n) => n.request.identifier),
  dismiss: (id) => Notifications.dismissNotificationAsync(id),
};

/** The fields of a notification response the app acts on, from a listener or the background task alike. */
export type NotificationTap = { id: string; action: string; date: number; data: Record<string, unknown> };

export function tapOf(response: Notifications.NotificationResponse): NotificationTap {
  const n = response.notification;
  return { id: n.request.identifier, action: response.actionIdentifier, date: n.date, data: n.request.content.data ?? {} };
}

/** The deep link a tap on the notification's body opens; null for an action button. */
export function bodyTapUrl(response: Notifications.NotificationResponse | null): string | null {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const url = response.notification.request.content.data?.url;
  return typeof url === 'string' ? url : null;
}
