import { useQuery } from '@tanstack/react-query';
import { getCurrentLocation, getThinnedTrack, listVisits } from '@lupira/cal-api/fetch/location';
import { LIVE_FIX_POLL_MS, LIVE_FIX_STALE_MS, movementStaleMs } from '@lupira/cal-domain/geo';
import { trackBucketSeconds } from '@lupira/cal-domain/mapWindow';
import { useSyncStatus } from '../sync/syncStatus';

/** GPS reads for the map, online-only. Empty until something uploads — this app's own recorder is the
 *  only producer. */


export function useVisits(fromIso: string, toIso: string, enabled: boolean) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['map', 'visits', fromIso, toIso],
    enabled: enabled && reachable,
    staleTime: movementStaleMs(toIso),
    retry: 1,
    queryFn: async () => {
      const r = await listVisits({ from: fromIso, to: toIso });
      if (r.status !== 200) throw new Error(`visits ${r.status}`);
      return r.data;
    },
  });
}

export function useThinnedTrack(fromIso: string, toIso: string, enabled: boolean) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['map', 'track', fromIso, toIso],
    enabled: enabled && reachable,
    staleTime: movementStaleMs(toIso),
    retry: 1,
    queryFn: async () => {
      // Raw /location/track caps at 50k points; the thinned form is one best fix per bucket.
      const bucketSeconds = trackBucketSeconds(new Date(fromIso), new Date(toIso));
      const r = await getThinnedTrack({ from: fromIso, to: toIso, bucketSeconds });
      if (r.status !== 200) throw new Error(`track ${r.status}`);
      return r.data;
    },
  });
}

export function useCurrentFixes(enabled: boolean, live: boolean) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['map', 'current'],
    enabled: enabled && reachable,
    staleTime: LIVE_FIX_STALE_MS,
    refetchInterval: live ? LIVE_FIX_POLL_MS : false,
    retry: 1,
    queryFn: async () => {
      const r = await getCurrentLocation();
      if (r.status !== 200) throw new Error(`current ${r.status}`);
      return r.data;
    },
  });
}
