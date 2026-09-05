import { keepPreviousData } from '@tanstack/react-query';
import { useListItems } from '@lupira/cal-api/query/tasks';
import type { ItemDto } from '@lupira/cal-api/models';
import { isOpenDeadline, type OpenDeadline } from '@lupira/cal-domain/tasks';

/** A LupiraTasks item that qualifies as a grid deadline — narrowed once here, so `fromTask` need not re-check. */
export type OpenTask = ItemDto & OpenDeadline;

/**
 * Open tasks due inside [from, to) — the calendar's third entry source. The generated hook keys
 * `['/tasks-api/items', params]`, so it cannot collide with cal-api's `/items` invalidation.
 */
export function useTaskDeadlines(from: string, to: string, enabled: boolean): OpenTask[] {
  const { data } = useListItems(
    { dueFrom: from, dueTo: to, completed: false },
    {
      query: {
        enabled,
        placeholderData: keepPreviousData,
        select: (items) => items.filter((i): i is OpenTask => isOpenDeadline(i)),
      },
    },
  );
  return (enabled ? data : undefined) ?? [];
}
