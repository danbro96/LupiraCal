import { keepPreviousData } from '@tanstack/react-query';
import {
  useGetCurrentLocation,
  useGetThinnedTrack,
  useListTrips,
  useListVisits,
} from '@lupira/cal-api/query/location';
import { LIVE_FIX_POLL_MS, LIVE_FIX_STALE_MS, movementStaleMs } from '@lupira/cal-domain/geo';

/**
 * GPS read models for the map, online-only. Query keys are collision-free with the other APIs
 * (everything lives under /location/*) — the generated hooks are safe as-is; never wrap location's
 * /me here. Windows fully before today are immutable (raw points are append-only and the visit/trip
 * rollup only reworks yesterday+today), so they cache forever.
 */
export function useVisits(from: string, to: string, enabled: boolean) {
  return useListVisits(
    { from, to },
    { query: { enabled, staleTime: movementStaleMs(to), placeholderData: keepPreviousData } },
  );
}

export function useTrips(from: string, to: string, enabled: boolean) {
  return useListTrips(
    { from, to },
    { query: { enabled, staleTime: movementStaleMs(to), placeholderData: keepPreviousData } },
  );
}

/** One best-accuracy fix per bucket — the drawable form of a track (raw /location/track caps at 50k). */
export function useThinnedTrack(from: string, to: string, enabled: boolean, bucketSeconds = 30) {
  return useGetThinnedTrack(
    { from, to, bucketSeconds },
    { query: { enabled, staleTime: movementStaleMs(to), placeholderData: keepPreviousData } },
  );
}

/** Latest fix per device, polled while the movement layer is visible. */
export function useCurrentFixes(enabled: boolean) {
  return useGetCurrentLocation(undefined, {
    query: { enabled, refetchInterval: LIVE_FIX_POLL_MS, staleTime: LIVE_FIX_STALE_MS },
  });
}
