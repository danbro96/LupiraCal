import { RELATION_KINDS, viewRelationship, type ResolvedRelation } from '@lupira/cal-domain/contactRelations';
import { useQuery } from '@tanstack/react-query';
import { getDb } from '../data/db/expoDb';
import { listContacts, loadContact, relationshipsOf, type ContactListRow } from '../data/mirror';

/** Contact reads from the mirror. Both the list and the per-contact doc sit under ['contacts'],
 *  which is what sync/reactivity.ts invalidates after a pull. */

export function useContactList() {
  return useQuery<ContactListRow[]>({ queryKey: ['contacts', 'list'], queryFn: async () => listContacts(await getDb()) });
}

export function useContactState(id: string) {
  return useQuery({ queryKey: ['contacts', id], queryFn: async () => loadContact(await getDb(), id) });
}

export type ContactRelationRow = ResolvedRelation & { displayName: string };

/** The contact's relationships as seen from it, from the mirror — the same view the API's listing gives, offline.
 *  Ordered by name, then kind. */
export function useContactRelations(id: string) {
  return useQuery<ContactRelationRow[]>({
    queryKey: ['contacts', id, 'relations'],
    queryFn: async () =>
      (await relationshipsOf(await getDb(), id))
        .map(({ record, otherName }) => ({ ...viewRelationship(id, record), displayName: otherName }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName) || RELATION_KINDS.indexOf(a.kind) - RELATION_KINDS.indexOf(b.kind)),
  });
}
