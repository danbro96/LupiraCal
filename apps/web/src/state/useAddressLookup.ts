import { useForwardGeocode } from '@lupira/cal-api/query/geo';
import { GeocodeIntent } from '@lupira/cal-api/models';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import { ADDRESS_SEARCH_LIMIT, PLACE_SEARCH_DEBOUNCE_MS } from '@danbro96/lupira-domain-places/placeCandidates';
import { addressQuery, type AddressDraft, type AddressQuery } from '@lupira/cal-domain/addressDraft';
import { useDebounced } from './useDebounced';

/** Address suggestions for a structured draft while it is typed. */
export function useAddressLookup(draft: AddressDraft, near?: GeoPoint | null, enabled = true) {
  const typed = JSON.stringify(enabled ? addressQuery(draft) : null);
  const settled = useDebounced(typed, PLACE_SEARCH_DEBOUNCE_MS);
  const q = JSON.parse(settled) as AddressQuery | null;
  const { data, isFetching, isError } = useForwardGeocode(
    q
      ? {
          street: q.street,
          postcode: q.postcode,
          locality: q.locality,
          countryCode: q.countryCode,
          intent: GeocodeIntent.Typeahead,
          nearLat: near?.lat,
          nearLon: near?.lon,
          limit: ADDRESS_SEARCH_LIMIT,
        }
      : undefined,
    { query: { enabled: !!q } },
  );
  return { hits: q ? data ?? [] : [], searching: typed !== 'null' && (typed !== settled || isFetching), failed: !!q && isError };
}
