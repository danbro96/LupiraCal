import { useQueryClient } from '@tanstack/react-query';

/**
 * Invalidation helpers over the orval-generated query keys, which are the BFF's own paths — every
 * one carries its route prefix, so `/api/items` (cal) and `/tasks-api/items` (tasks) no longer
 * collide and a prefix match can no longer sweep the wrong API's queries.
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

/** Geo place mutations: the place queries themselves plus the `/curation` lists and hotspots that mirror place state. */
export function useInvalidatePlaces() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (q) => {
        const key = String(q.queryKey[0] ?? '');
        return key.startsWith('/geo-api/places') || key.startsWith('/geo-api/me/places') || key.startsWith('/geo-api/curation')
          || key.startsWith('/api/hotspots');
      },
    });
}

/** Photo writes: every gallery query plus the photo↔event edge map, which a link or a delete changes. */
export function useInvalidatePhotos() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (q) => {
        const key = String(q.queryKey[0] ?? '');
        return key.startsWith('/photo-api/photos') || key.startsWith('/api/relations/edges');
      },
    });
}
