import { useGetMe } from '@lupira/cal-api/query/contact';

/** Your own contact id, as contact-api links it; null until it loads or when none is linked. */
export function useMyContactId(): string | null {
  return useMyContactLink() ?? null;
}

/** Your linked contact id: undefined while loading, null when none is linked. */
export function useMyContactLink(): string | null | undefined {
  const { data } = useGetMe();
  return data ? (data.contactId ?? null) : undefined;
}
