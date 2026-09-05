import { useQueries } from '@tanstack/react-query';
import { listItems } from '@lupira/cal-api/fetch/tasks';
import { monthUtcRange } from '@lupira/cal-domain/tasks';
import { taskDeadlineRows, type TaskDeadlineRow } from '../domain/taskRows';
import { useSyncStatus } from '../sync/syncStatus';
import { usePrefs } from './prefs-store';

/** Task deadlines for the visible days — the only network-backed grid query. Keyed ['tasks', monthKey]:
 *  outside every sync-invalidation prefix (['items']/['occurrences'] are blanket-nuked by pulls). The
 *  pref rides `enabled`, not the key (off means "don't fetch", not "different result set"). staleTime and
 *  retry MUST override the mirror-tuned defaults (Infinity/false) or deadlines freeze forever. Offline or
 *  toggled off the queries idle and grids simply lack deadlines — never an error surface, never a loading
 *  gate on grid paint. serverReachable flipping back on is the de-facto reconnect refetch trigger
 *  (onlineManager isn't wired to NetInfo in this app). */
export function useTaskDeadlines(dayKeys: string[]): TaskDeadlineRow[] {
  const showTasks = usePrefs((p) => p.showTaskDeadlines);
  const reachable = useSyncStatus((s) => s.serverReachable);
  const monthKeys = [...new Set(dayKeys.map((d) => d.slice(0, 7)))];
  const results = useQueries({
    queries: monthKeys.map((monthKey) => ({
      queryKey: ['tasks', monthKey] as const,
      enabled: showTasks && reachable,
      staleTime: 60_000,
      retry: 1,
      queryFn: async () => {
        const r = await listItems({ ...monthUtcRange(monthKey), completed: false });
        if (r.status !== 200) throw new Error(`tasks fetch ${r.status}`);
        return taskDeadlineRows(r.data, new Date());
      },
    })),
  });
  const daySet = new Set(dayKeys);
  return results.flatMap((r) => r.data ?? []).filter((r) => daySet.has(r.start_day));
}
