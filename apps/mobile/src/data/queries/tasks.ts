import type { TaskLike } from '@lupira/cal-domain/tasks';
import type { Tx } from '@danbro96/lupira-expo-sqlite/types';

/** Open task deadlines due on a day in [fromDay, toDay). */
export async function taskDeadlinesBetween(tx: Tx, fromDay: string, toDay: string): Promise<TaskLike[]> {
  return tx.all<TaskLike>(
    `SELECT item_id AS id, list_id AS listId, title, due_on AS dueOn, due_at AS dueAt, status
     FROM task_deadlines WHERE due_day >= ? AND due_day < ? ORDER BY due_day, due_at`,
    [fromDay, toDay],
  );
}
