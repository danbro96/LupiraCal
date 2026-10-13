import { useQuery } from '@tanstack/react-query';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import type { AddressHint } from '../domain/bridgeTranslate';
import { ADDRESS_HINTS_KEY, listAddressHints } from '../sync/bridge';

/** Addresses typed for this contact in the phone's Contacts app that no place backs yet. */
export function useAddressHints(contactId: string | undefined): AddressHint[] {
  const q = useQuery({
    ...mirrorQuery([...ADDRESS_HINTS_KEY, contactId], () => listAddressHints(contactId!)),
    enabled: !!contactId,
  });
  return q.data ?? [];
}
