import * as Notifications from 'expo-notifications';
import { RSVP_ACTIONS } from '../../domain/rsvpPrompts';
import type { NotificationPermission } from './port';

/** Channels must exist before the permission prompt: Android 13 shows it only once one does. */
export async function setUpNotificationChannels(): Promise<void> {
  await Notifications.setNotificationChannelAsync('reminders', { name: 'Event reminders', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync('daily', { name: 'Daily summaries', importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.setNotificationChannelAsync('rsvp', { name: 'Invitations', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationCategoryAsync('rsvp', RSVP_ACTIONS.map((a) => ({
    identifier: a.status,
    buttonTitle: a.title,
    options: { opensAppToForeground: false, ...(a.status === 'Declined' ? { isDestructive: true } : {}) },
  })));
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return (await Notifications.requestPermissionsAsync()).status as NotificationPermission;
}

export type NotificationAccess = { permission: NotificationPermission; canAskAgain: boolean };

export async function notificationAccess(): Promise<NotificationAccess> {
  const p = await Notifications.getPermissionsAsync();
  return { permission: p.status as NotificationPermission, canAskAgain: p.canAskAgain };
}

export function showNotificationsInForeground(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}
