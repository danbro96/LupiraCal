import type { RelationshipRecord } from '@lupira/cal-domain/contactRelations';
import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { Aggregate } from '../../domain/aggregates';

export type ContactRelationshipRow = { record: RelationshipRecord; otherId: string; otherName: string };

/** A contact's relationships with the other contact's name. Those whose other contact is absent from the mirror
 *  are dropped, as the server's listing drops them. */
export async function relationshipsOf(tx: Tx, contactId: string): Promise<ContactRelationshipRow[]> {
  const rows = await tx.all<{ local: string; other_id: string; other_name: string }>(
    `SELECT d.local, o.id AS other_id, o.display_name AS other_name
     FROM relationship_index r
     JOIN docs d ON d.aggregate = '${Aggregate.relationship}' AND d.id = r.id AND d.local IS NOT NULL
     JOIN contact_index o ON o.id = CASE WHEN r.low_id = ? THEN r.high_id ELSE r.low_id END
     WHERE r.low_id = ? OR r.high_id = ?`,
    [contactId, contactId, contactId],
  );
  return rows.map((r) => ({ record: (JSON.parse(r.local) as { doc: RelationshipRecord }).doc, otherId: r.other_id, otherName: r.other_name }));
}
