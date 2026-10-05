import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { Aggregate } from '../../domain/aggregates';
import type { ContactDoc } from '../../domain/docTypes';

export type ContactListRow = { id: string; displayName: string; doc: ContactDoc };

export async function listContacts(tx: Tx): Promise<ContactListRow[]> {
  const rows = await tx.all<{ id: string; display_name: string; local: string }>(
    `SELECT c.id, c.display_name, d.local FROM contact_index c
     JOIN docs d ON d.aggregate = '${Aggregate.contact}' AND d.id = c.id AND d.local IS NOT NULL
     ORDER BY c.display_name COLLATE NOCASE`);
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, doc: (JSON.parse(r.local) as { doc: ContactDoc }).doc }));
}
