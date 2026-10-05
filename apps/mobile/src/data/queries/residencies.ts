import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { Aggregate } from '../../domain/aggregates';

export type ResidencyRow = {
  contact_id: string;
  display_name: string;
  place_id: string;
  address_type: string | null;
  label: string | null;
  moved_in: string | null;
  moved_out: string | null;
};

/** Every residency of a mirrored contact, with the contact's name — so the place picker, quick places and contact
 *  cards work offline. Fuzzy dates come back as JSON for the caller's residency logic. */
export async function contactResidencies(tx: Tx): Promise<ResidencyRow[]> {
  return tx.all<ResidencyRow>(
    `SELECT c.id AS contact_id, c.display_name, r.place_id,
            json_extract(d.local, '$.doc.type')     AS address_type,
            json_extract(d.local, '$.doc.label')    AS label,
            json_extract(d.local, '$.doc.movedIn')  AS moved_in,
            json_extract(d.local, '$.doc.movedOut') AS moved_out
     FROM residency_index r
     JOIN docs d ON d.aggregate = '${Aggregate.residency}' AND d.id = r.id AND d.local IS NOT NULL
     JOIN contact_index c ON c.id = r.contact_id
     ORDER BY c.display_name COLLATE NOCASE`,
  );
}
