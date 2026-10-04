import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListAddressBooksQueryKey,
  useContactBootstrapMe,
  useListAddressBooks,
} from '@lupira/cal-api/query/contact';
import type { AddressBookDto } from '@lupira/cal-api/models';
import { needsAddressBookBootstrap } from '@lupira/cal-domain/bootstrap';

export function useAddressBooks() {
  const query = useListAddressBooks();
  const addressBooks = query.data ?? [];
  return { ...query, addressBooks };
}

export function addressBookLabel(b: AddressBookDto): string {
  return b.displayName || b.slug;
}

/** First-login seeding: once books load with none, run contact /me/bootstrap (idempotent) once. */
export function useEnsureContactBootstrap() {
  const queryClient = useQueryClient();
  const { isSuccess, addressBooks } = useAddressBooks();
  const bootstrap = useContactBootstrapMe({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAddressBooksQueryKey() }),
    },
  });
  const started = useRef(false);
  const { mutate } = bootstrap;

  useEffect(() => {
    if (isSuccess && needsAddressBookBootstrap(addressBooks) && !started.current) {
      started.current = true;
      mutate();
    }
  }, [isSuccess, addressBooks, mutate]);

  return bootstrap.isPending;
}
