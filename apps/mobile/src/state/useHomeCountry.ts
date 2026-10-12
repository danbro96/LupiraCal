import { AdminLevel } from '@lupira/cal-api/models';
import { withResidency } from '@danbro96/lupira-domain-contacts/residents';
import { useMyContactId } from './useMe';
import { useResidencyRows } from './useResidencies';
import { usePlaceCoords } from './usePlaceLookup';

const FALLBACK_COUNTRY = 'SE';

/** The country your home is in, as an ISO code; Sweden until it is known. */
export function useHomeCountry(): string {
  const me = useMyContactId();
  const rows = useResidencyRows();
  const homeId = rows.find((r) => r.contactId === me && r.addressType === 'Home' && withResidency(r).status === 'active')?.placeId ?? null;
  const home = usePlaceCoords([homeId]).get(homeId ?? '');
  return home?.containment?.find((a) => a.level === AdminLevel.Country)?.isoCode?.toUpperCase() || FALLBACK_COUNTRY;
}
