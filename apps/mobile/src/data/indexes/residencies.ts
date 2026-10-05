import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import type { ResidencyDoc } from '../../domain/docTypes';

export const RESIDENCY_TABLES = ['residency_index'];

export const RESIDENCY_DDL = `
  CREATE TABLE residency_index (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    place_id TEXT NOT NULL
  );
  CREATE INDEX residency_index_contact ON residency_index (contact_id);
`;

export async function writeResidencyIndex(tx: Tx, id: string, state: { doc: ResidencyDoc } | null): Promise<void> {
  await tx.run('DELETE FROM residency_index WHERE id = ?', [id]);
  if (!state) return;
  await tx.run('INSERT INTO residency_index (id, contact_id, place_id) VALUES (?, ?, ?)', [id, state.doc.contactId, state.doc.placeId]);
}
