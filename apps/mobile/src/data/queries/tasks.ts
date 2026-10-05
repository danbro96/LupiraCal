import type { TaskLike } from '@lupira/cal-domain/tasks';
import type { Tx } from '@danbro96/lupira-expo-sqlite/types';

/** Open task deadlines due in [fromIso, toIso). */
export async function taskDeadlinesBetween(tx: Tx, fromIso: string, toIso: string): Promise<TaskLike[]> {
  return tx.all<TaskLike>(
    `SELECT item_id AS id, list_id AS listId, title, due AS dueAt, status
     FROM task_deadlines WHERE due >= ? AND due < ? ORDER BY due`,
    [fromIso, toIso],
  );
}
