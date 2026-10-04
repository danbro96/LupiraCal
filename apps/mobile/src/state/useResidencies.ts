import { useQuery } from '@tanstack/react-query';
import { residencyStatus, type FuzzyDate } from '@lupira/cal-domain/fuzzyDate';
import { parentsHomes, type ContactAddressRow, type ParentsHome } from '@lupira/cal-domain/residents';
import { getDb } from '../data/db/expoDb';
import { contactResidencies, placeEntryOf } from '../data/mirror';
import type { PlaceEntryDoc } from '../domain/docTypes';
import { useContactRelations } from './useContactList';

const parseFuzzy = (raw: string | null): FuzzyDate | null => (raw ? (JSON.parse(raw) as FuzzyDate) : null);

/** Every live contact's residencies from the mirror, as `@lupira/cal-domain/residents` rows. One query serves the map,
 *  the place picker, quick places and contact cards, so they agree and share one place lookup. */
export function useResidencyRows(enabled = true): ContactAddressRow[] {
  const q = useQuery({
    queryKey: ['contacts', 'residencies'],
    enabled,
    queryFn: async () => contactResidencies(await getDb()),
  });
  return (q.data ?? []).map((r) => ({
    contactId: r.contact_id,
    displayName: r.display_name,
    placeId: r.place_id,
    addressType: r.address_type,
    label: r.label,
    movedIn: parseFuzzy(r.moved_in),
    movedOut: parseFuzzy(r.moved_out),
  }));
}

/** Where the contact's parents live now — derived from Parent relationships and their residencies, never stored. */
export function useParentsHomes(contactId: string | null, rows: readonly ContactAddressRow[]): ParentsHome[] {
  const { data: relations } = useContactRelations(contactId ?? '');
  if (!contactId) return [];
  const parents = (relations ?? []).filter((r) => r.kind === 'Parent' && !r.ended).map((r) => ({ contactId: r.otherId, displayName: r.displayName }));
  return parentsHomes(contactId, parents, rows);
}

/** A place's door codes from the mirror, shown only while the mirror still has someone living there now — a move-out
 *  date passing changes nothing on the server's feed until the next full sync. */
export function usePlaceEntry(placeId: string | null | undefined, rows: readonly ContactAddressRow[]): PlaceEntryDoc | null {
  const q = useQuery({
    queryKey: ['contacts', 'place-entry', placeId],
    enabled: !!placeId,
    queryFn: async () => placeEntryOf(await getDb(), placeId!),
  });
  const lived = rows.some((r) => r.placeId === placeId && residencyStatus(r.movedIn, r.movedOut) === 'active');
  return lived && q.data && q.data.codes.length > 0 ? q.data : null;
}
