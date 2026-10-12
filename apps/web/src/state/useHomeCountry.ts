import { AdminLevel } from '@lupira/cal-api/models';
import { useGeoPlace } from './usePlaces';

const FALLBACK_COUNTRY = 'SE';

/** The country your home is in, as an ISO code; Sweden until it is known. */
export function useHomeCountry(homePlaceId: string | null | undefined): string {
  const { data } = useGeoPlace(homePlaceId ?? undefined);
  return data?.containment?.find((a) => a.level === AdminLevel.Country)?.isoCode?.toUpperCase() || FALLBACK_COUNTRY;
}
