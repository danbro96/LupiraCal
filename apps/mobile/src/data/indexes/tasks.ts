import { dueDay, isOpenDeadline } from '@lupira/cal-domain/tasks';
import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import type { TaskDoc } from '../../domain/docTypes';

export const TASK_TABLES = ['task_deadlines'];

export const TASK_DDL = `
  CREATE TABLE task_deadlines (
    item_id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    due_day TEXT NOT NULL,
    due_on TEXT,
    due_at TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE INDEX task_deadlines_due_day ON task_deadlines (due_day);
`;

/** Open deadlines only, on their LOCAL due day; a timed `due_at` is normalized to UTC. */
export async function writeTaskIndex(tx: Tx, id: string, state: { doc: TaskDoc } | null): Promise<void> {
  await tx.run('DELETE FROM task_deadlines WHERE item_id = ?', [id]);
  const t = state?.doc;
  if (!t || t.completed || !isOpenDeadline(t)) return;
  await tx.run('INSERT INTO task_deadlines (item_id, list_id, due_day, due_on, due_at, title, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, t.listId, dueDay(t), t.dueOn ?? null, t.dueAt != null ? new Date(t.dueAt).toISOString() : null, t.title, t.status]);
}
