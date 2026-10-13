import { useQuery } from '@tanstack/react-query';
import { expoNotificationPort } from '../data/notifications/port';
import { notificationAccess, requestNotificationPermission, type NotificationAccess } from '../data/notifications/setup';
import { notifications } from '../sync/engine';
import { queryClient } from '../sync/queryClient';

const KEY = ['notify', 'access'];

export type NotificationAccessState = NotificationAccess & { exact: boolean };

/** The permission and exact-alarm state, read again whenever the app returns from the system settings. */
export function useNotificationAccess() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<NotificationAccessState> => ({ ...(await notificationAccess()), exact: await expoNotificationPort.canScheduleExact() }),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
  });
}

export async function allowNotifications(): Promise<void> {
  await requestNotificationPermission();
  await queryClient.invalidateQueries({ queryKey: KEY });
  await notifications.reconcile();
}
