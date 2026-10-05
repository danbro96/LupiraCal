import { isOpenDeadline } from '@lupira/cal-domain/tasks';
import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import type { TaskDoc } from '../../domain/docTypes';

export const TASK_TABLES = ['task_deadlines'];

export const TASK_DDL = `
  CREATE TABLE task_deadlines (
    item_id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    due TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE INDEX task_deadlines_due ON task_deadlines (due);
`;

/** Open deadlines only; `due` is normalized to UTC so range filters compare as strings. */
export async function writeTaskIndex(tx: Tx, id: string, state: { doc: TaskDoc } | null): Promise<void> {
  await tx.run('DELETE FROM task_deadlines WHERE item_id = ?', [id]);
  const t = state?.doc;
  if (!t || t.completed || !isOpenDeadline(t)) return;
  await tx.run('INSERT INTO task_deadlines (item_id, list_id, due, title, status) VALUES (?, ?, ?, ?, ?)',
    [id, t.listId, new Date(t.dueAt).toISOString(), t.title, t.status]);
}
