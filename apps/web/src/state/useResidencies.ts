import { useMemo } from 'react';
import { useListContactRelations, useListResidencies, useSearchContacts } from '@lupira/cal-api/query/contact';
import { parentsHomes, type ContactAddressRow, type ParentsHome } from '@lupira/cal-domain/residents';

/** Every readable contact's residencies as `@lupira/cal-domain/residents` rows (named), for the map, the place picker,
 *  quick places and contact cards — one fetch each, shared by react-query. */
export function useResidencyRows(enabled = true): { rows: ContactAddressRow[]; isLoading: boolean } {
  const residencies = useListResidencies({ query: { enabled } });
  const contacts = useSearchContacts({}, { query: { enabled } });
  return useMemo(() => {
    const names = new Map((contacts.data ?? []).map((c) => [c.id, c.displayName]));
    const rows = (residencies.data ?? []).flatMap((r) => {
      const displayName = names.get(r.contactId);
      return displayName === undefined ? [] : [{
        contactId: r.contactId, displayName, placeId: r.placeId, addressType: r.type, label: r.label ?? null,
        movedIn: r.movedIn ?? null, movedOut: r.movedOut ?? null,
      }];
    });
    return { rows, isLoading: residencies.isLoading || contacts.isLoading };
  }, [residencies.data, residencies.isLoading, contacts.data, contacts.isLoading]);
}

/** Where the contact's parents live now — derived from Parent relationships and their residencies, never stored. */
export function useParentsHomes(contactId: string | null, rows: readonly ContactAddressRow[]): ParentsHome[] {
  const { data: relations } = useListContactRelations(contactId ?? '', undefined, { query: { enabled: !!contactId } });
  return useMemo(() => {
    if (!contactId) return [];
    const parents = (relations ?? []).filter((r) => r.kind === 'Parent' && !r.ended && r.provenance !== 'Inferred')
      .map((r) => ({ contactId: r.contactId, displayName: r.displayName }));
    return parentsHomes(contactId, parents, rows);
  }, [contactId, relations, rows]);
}
