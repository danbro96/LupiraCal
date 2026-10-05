import { dueDay, isOpenDeadline, isOverdue, type TaskLike } from '@lupira/cal-domain/tasks';

/** Task deadlines are the grids' third entry source (after items and birthdays), read from the read-only
 *  tasks mirror. Rows are GridRow-shaped so the render sites take them unchanged.
 *  Which tasks qualify, and what "due day" and "overdue" mean, is shared with the web in
 *  `@lupira/cal-domain/tasks`; only this mirror-shaped row is the app's own. */
export type TaskDeadlineRow = {
  source: 'task';
  source_id: string;
  start_utc: string;
  end_utc: null;
  start_day: string;
  all_day: 1;
  title: string | null;
  status: string | null;
  calendar_id: null;
  is_availability: 0;
  avail_status: null;
  task: { listId: string; itemId: string; dueAt: string; overdue: boolean };
};

export function taskDeadlineRows(items: TaskLike[], now: Date): TaskDeadlineRow[] {
  return items.filter(isOpenDeadline).map((t) => ({
    source: 'task' as const,
    source_id: t.id,
    start_utc: t.dueAt,
    end_utc: null,
    start_day: dueDay(t.dueAt),
    all_day: 1 as const,
    title: t.title,
    status: t.status,
    calendar_id: null,
    is_availability: 0 as const,
    avail_status: null,
    task: { listId: t.listId, itemId: t.id, dueAt: t.dueAt, overdue: isOverdue(t.dueAt, now) },
  }));
}

export function isTaskRow(r: { source: string }): r is TaskDeadlineRow {
  return r.source === 'task';
}
