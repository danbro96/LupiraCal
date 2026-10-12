import { useReverseGeocode } from '@lupira/cal-api/query/geo';
import { ReversePrecision } from '@lupira/cal-api/models';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import { pinNameSuggestion } from '@danbro96/lupira-domain-places/pin';

/** A name for a dropped pin from the building it lands on; null until known or when there is none. */
export function usePinSuggestion(point: GeoPoint | null) {
  const { data, isFetching } = useReverseGeocode(
    { lat: point?.lat ?? 0, lon: point?.lon ?? 0, precision: ReversePrecision.Building },
    { query: { enabled: !!point, retry: false } },
  );
  return { suggestion: point ? pinNameSuggestion(data) : null, loading: !!point && isFetching };
}
