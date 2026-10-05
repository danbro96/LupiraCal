import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { Aggregate } from '../domain/aggregates';
import { engine } from '../sync/engine';

export type AddressBookContainer = { id: string; displayName?: string | null; access?: string };

export function useAddressBooks() {
  return useQuery(mirrorQuery([Aggregate.addressBook], async () =>
    (await engine.docs<AddressBookContainer, null>(Aggregate.addressBook)).map((d) => d.state.doc)));
}
