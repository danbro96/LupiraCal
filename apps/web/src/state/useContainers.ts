import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListContainersQueryKey, useBootstrapMe, useListContainers } from '@lupira/cal-api/query/cal';
import { needsCalendarBootstrap } from '@lupira/cal-domain/bootstrap';

export function useContainers() {
  const query = useListContainers();
  const containers = query.data ?? [];
  // Containers are all calendars now — address books moved to LupiraContactApi (useAddressBooks).
  const calendars = containers;
  return { ...query, containers, calendars };
}

/** First-login seeding: once containers load without the standard set, run /me/bootstrap (idempotent) once. */
export function useEnsureBootstrap() {
  const queryClient = useQueryClient();
  const { isSuccess, calendars } = useContainers();
  const bootstrap = useBootstrapMe({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListContainersQueryKey() }),
    },
  });
  const started = useRef(false);
  const { mutate } = bootstrap;

  useEffect(() => {
    if (isSuccess && needsCalendarBootstrap(calendars) && !started.current) {
      started.current = true;
      mutate({});
    }
  }, [isSuccess, calendars, mutate]);

  return bootstrap.isPending;
}

export { calendarLabel } from '@lupira/cal-domain/calendars';
