import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { preferredCalendar } from './calendarFilter';

export type HierarchyRow = {
  id: string;
  title: string | null;
  is_all_day: number;
  calendar_id: string | null;
  color: string | null;
  /** First mirrored occurrence, else the item's own start (it may predate the window). */
  start_utc: string | null;
};

export type ItemHierarchy = { parent: HierarchyRow | null; children: HierarchyRow[] };

const ROW = `i.id, i.title, i.is_all_day, ${preferredCalendar('i.id')} AS calendar_id, i.color,
            COALESCE((SELECT MIN(o.start_utc) FROM item_occurrences o WHERE o.item_id = i.id), i.start_utc) AS start_utc`;

/** The item's parent (when mirrored) and its direct children, earliest first. */
export async function itemHierarchy(tx: Tx, itemId: string, parentId: string | null): Promise<ItemHierarchy> {
  const parent = parentId
    ? (await tx.all<HierarchyRow>(`SELECT ${ROW} FROM item_index i WHERE i.id = ?`, [parentId]))[0] ?? null
    : null;
  const children = await tx.all<HierarchyRow>(
    `SELECT ${ROW} FROM item_index i WHERE i.parent_item_id = ? ORDER BY start_utc IS NULL, start_utc, i.title`,
    [itemId],
  );
  return { parent, children };
}
