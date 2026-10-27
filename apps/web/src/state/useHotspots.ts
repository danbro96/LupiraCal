import { useGetHotspots } from '@lupira/cal-api/query/cal';
import { hotspotWindowFrom } from '@lupira/cal-domain/placePrediction';

const STALE_MS = 10 * 60_000;

/** Hotspots over the last 24 months, ranked by active days — what the place picker calls frequent. */
export function useHotspots(enabled: boolean) {
  return useGetHotspots({ from: hotspotWindowFrom(new Date()) }, { query: { enabled, staleTime: STALE_MS } });
}
