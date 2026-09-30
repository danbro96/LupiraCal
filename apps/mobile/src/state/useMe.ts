import { useQuery } from '@tanstack/react-query';
import { getDb } from '../data/db/expoDb';
import { loadMyContactId } from '../data/me';

/** Your own contact id from the mirror (sync refreshes it); null when contact-api has none linked. */
export function useMyContactId(): string | null {
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: async () => loadMyContactId(await getDb()),
  });
  return data ?? null;
}
