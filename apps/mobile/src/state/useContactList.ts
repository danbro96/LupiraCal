import { RELATION_KINDS, viewRelationship, type ResolvedRelation } from '@lupira/cal-domain/contactRelations';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { listContacts } from '../data/queries/contacts';
import { relationshipsOf } from '../data/queries/relationships';
import { Aggregate } from '../domain/aggregates';
import type { ContactDoc, ContactGuards } from '../domain/docTypes';
import { engine, readyDb } from '../sync/engine';

export function useContactList() {
  return useQuery(mirrorQuery([Aggregate.contact, 'list'], async () => listContacts(await readyDb())));
}

export function useContactState(id: string) {
  return useQuery(mirrorQuery([Aggregate.contact, id], () => engine.doc<ContactDoc, ContactGuards>(Aggregate.contact, id)));
}

export type ContactRelationRow = ResolvedRelation & { displayName: string };

/** The contact's relationships as seen from it, from the mirror — the same view the API's listing gives, offline.
 *  Ordered by name, then kind. */
export function useContactRelations(id: string) {
  return useQuery(mirrorQuery([Aggregate.relationship, id], async (): Promise<ContactRelationRow[]> =>
    (await relationshipsOf(await readyDb(), id))
      .map(({ record, otherName }) => ({ ...viewRelationship(id, record), displayName: otherName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || RELATION_KINDS.indexOf(a.kind) - RELATION_KINDS.indexOf(b.kind))));
}
