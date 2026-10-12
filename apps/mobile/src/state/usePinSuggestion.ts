import { useQuery } from '@tanstack/react-query';
import { reverseGeocode } from '@lupira/cal-api/fetch/geo';
import { ReversePrecision } from '@lupira/cal-api/models';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { pinNameSuggestion } from '@danbro96/lupira-domain-places/pin';

// ~11 m, so a pin nudged a hair doesn't ask again.
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** What to call a dropped pin: the building or street address under it. */
export function usePinSuggestion(point: { lat: number; lon: number } | null) {
  const at = point ? { lat: round(point.lat), lon: round(point.lon) } : null;
  const q = useQuery({
    ...onlineQuery(['places', 'reverse', at?.lat, at?.lon], () =>
      reverseGeocode({ lat: at!.lat, lon: at!.lon, precision: ReversePrecision.Building })),
    enabled: !!at,
  });
  return { name: pinNameSuggestion(q.data), hit: q.data ?? null, loading: q.isFetching };
}
