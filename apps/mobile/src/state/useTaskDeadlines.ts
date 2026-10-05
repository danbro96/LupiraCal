import { monthUtcRange } from '@lupira/cal-domain/tasks';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQueries, useQuery } from '@tanstack/react-query';
import { taskDeadlinesBetween } from '../data/queries/tasks';
import { Aggregate } from '../domain/aggregates';
import type { ItemDto } from '@lupira/cal-api/models';
import { taskDeadlineRows, type TaskDeadlineRow } from '../domain/taskRows';
import { engine, readyDb } from '../sync/engine';
import { usePrefs } from './prefs-store';

/** Task deadlines for the visible days, from the read-only tasks mirror. The pref rides `enabled`, not the key
 *  (off means "don't read", not "different result set"). */
export function useTaskDeadlines(dayKeys: string[]): TaskDeadlineRow[] {
  const showTasks = usePrefs((p) => p.showTaskDeadlines);
  const monthKeys = [...new Set(dayKeys.map((d) => d.slice(0, 7)))];
  const results = useQueries({
    queries: monthKeys.map((monthKey) => ({
      ...mirrorQuery([Aggregate.taskItem, 'deadlines', monthKey], async () => {
        const { dueFrom, dueTo } = monthUtcRange(monthKey);
        return taskDeadlineRows(await taskDeadlinesBetween(await readyDb(), dueFrom, dueTo), new Date());
      }),
      enabled: showTasks,
    })),
  });
  const daySet = new Set(dayKeys);
  return results.flatMap((r) => r.data ?? []).filter((r) => daySet.has(r.start_day));
}

export function useTask(itemId: string) {
  return useQuery(mirrorQuery([Aggregate.taskItem, itemId], async () =>
    (await engine.doc<ItemDto, unknown>(Aggregate.taskItem, itemId))?.doc ?? null));
}
