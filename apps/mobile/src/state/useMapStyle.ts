import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { useQuery } from '@tanstack/react-query';
import type { MapTheme } from '@danbro96/lupira-tokens-map/map';
import { loadMapStyle, type BasemapStyle } from '../data/mapStyle';

export function useMapStyle(theme: MapTheme): { style: BasemapStyle | undefined; degraded: boolean } {
  const q = useQuery({ ...onlineQuery(['map', 'style', theme], () => loadMapStyle(theme)), staleTime: 60 * 60_000 });
  return { style: q.data, degraded: q.isError };
}
