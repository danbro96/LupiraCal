import type { RelationshipRecord } from '@lupira/cal-domain/contactRelations';
import type { Tx } from '@danbro96/lupira-expo-sqlite/types';

export const RELATIONSHIP_TABLES = ['relationship_index'];

export const RELATIONSHIP_DDL = `
  CREATE TABLE relationship_index (id TEXT PRIMARY KEY, low_id TEXT NOT NULL, high_id TEXT NOT NULL);
  CREATE INDEX relationship_index_low ON relationship_index (low_id);
  CREATE INDEX relationship_index_high ON relationship_index (high_id);
`;

export async function writeRelationshipIndex(tx: Tx, id: string, state: { doc: RelationshipRecord } | null): Promise<void> {
  await tx.run('DELETE FROM relationship_index WHERE id = ?', [id]);
  if (!state) return;
  await tx.run('INSERT INTO relationship_index (id, low_id, high_id) VALUES (?, ?, ?)', [id, state.doc.lowId, state.doc.highId]);
}
