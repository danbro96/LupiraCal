import { useQueryClient } from '@tanstack/react-query';

/**
 * Invalidation helpers over the orval-generated query keys, which are the BFF's own paths — every
 * one carries its route prefix, so `/api/items` (cal) and `/tasks-api/items` (tasks) never
 * collide and a prefix match can't sweep the wrong API's queries.
 *
 * Match on the prefixed path. A bare `/items` matches nothing.
 */
export function useInvalidateItems() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (q) => {
        const key = String(q.queryKey[0] ?? '');
        // Deliberately cal-only: task deadlines live under /tasks-api/items and are not touched by
        // a cal item mutation. Before the prefixes existed this needed a hand-written key to dodge.
        return key.startsWith('/api/items') || key.includes('/proposed');
      },
    });
}

export function useInvalidateContacts() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (q) => {
        const key = String(q.queryKey[0] ?? '');
        // `/api/contacts/...` is the BFF's own contact surface — a group add/remove changes what it
        // returns, and it does not share the upstream prefix.
        return key.startsWith('/contact-api/contacts')
          || key.startsWith('/contact-api/relationships')
          || key.startsWith('/contact-api/residencies')
          || key.startsWith('/contact-api/places')
          || key.startsWith('/api/contacts')
          || key.includes('/groups');
      },
    });
}

export function useInvalidateContainers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('/api/calendars') });
}

export function useInvalidateAddressBooks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('/contact-api/address-books') });
}
