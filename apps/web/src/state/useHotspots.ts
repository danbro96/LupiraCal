import { useGetHotspots } from '@lupira/cal-api/query/cal';

const STALE_MS = 10 * 60_000;

/** All-time hotspots, ranked by active days — what the place picker calls frequent. */
export function useHotspots(enabled: boolean) {
  return useGetHotspots(undefined, { query: { enabled, staleTime: STALE_MS } });
}
