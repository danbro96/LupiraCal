import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { forwardGeocode } from '@lupira/cal-api/fetch/geo';
import { GeocodeIntent } from '@lupira/cal-api/models';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { ADDRESS_SEARCH_LIMIT, PLACE_SEARCH_DEBOUNCE_MS } from '@danbro96/lupira-domain-places/placeCandidates';
import { addressQuery, type AddressDraft } from '@lupira/cal-domain/addressDraft';

/** Addresses matching a structured draft, once it names a street and a postcode or town; settles like typing. */
export function useAddressLookup(draft: AddressDraft) {
  const query = addressQuery(draft);
  const key = query ? JSON.stringify(query) : null;
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setSettled(key), PLACE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key]);

  return useQuery({
    ...onlineQuery(['places', 'address', settled], async () => {
      const { q, ...parts } = JSON.parse(settled!) as NonNullable<ReturnType<typeof addressQuery>>;
      const hits = await forwardGeocode({ ...parts, q, intent: GeocodeIntent.Typeahead, limit: ADDRESS_SEARCH_LIMIT });
      return hits.filter((h) => !h.isArea);
    }),
    enabled: !!settled && settled === key,
  });
}
