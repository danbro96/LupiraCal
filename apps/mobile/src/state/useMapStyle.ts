import { useQuery } from '@tanstack/react-query';
import type { MapTheme } from '@lupira/cal-tokens/map';
import { loadMapStyle, type BasemapStyle } from '../data/mapStyle';
import { useSyncStatus } from '../sync/syncStatus';

export function useMapStyle(theme: MapTheme): { style: BasemapStyle | undefined; degraded: boolean } {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const q = useQuery<BasemapStyle>({
    queryKey: ['map', 'style', theme],
    enabled: reachable,
    staleTime: 60 * 60_000,
    retry: 1,
    queryFn: () => loadMapStyle(theme),
  });
  return { style: q.data, degraded: q.isError };
}
