import { useQuery } from '@tanstack/react-query';
import { getParticipationSummary } from '@lupira/cal-api/fetch/cal';
import { useSyncStatus } from '../sync/syncStatus';

/** Who the caller meets most, for ranking the people picker. Kept out of ['items'] so a sync pull doesn't
 *  refetch it; the picker fails open to alphabetical while it loads or when offline. */
export function useParticipationSummary(enabled: boolean) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['participation', 'summary'],
    enabled: enabled && reachable,
    staleTime: 600_000,
    retry: 1,
    queryFn: async () => {
      const r = await getParticipationSummary();
      if (r.status !== 200) throw new Error(`participation summary ${r.status}`);
      return r.data;
    },
  });
}
