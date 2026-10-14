import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { Aggregate } from '../../domain/aggregates';

/** The series whose queue an item's ops join: while a split the server hasn't confirmed is creating the item, the
 *  series it continues, followed back. */
export async function lineageRoot(tx: Tx, itemId: string): Promise<string> {
  const seen = new Set<string>();
  let id = itemId;
  while (!seen.has(id)) {
    seen.add(id);
    const row = await tx.first<{ continues: string | null }>(
      `SELECT json_extract(local, '$.doc.continuesItemId') AS continues FROM docs
       WHERE aggregate = '${Aggregate.item}' AND id = ? AND server IS NULL`,
      [id],
    );
    if (!row?.continues) return id;
    id = row.continues;
  }
  return id;
}
