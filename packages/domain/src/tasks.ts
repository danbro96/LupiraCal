import { generateKeyBetween } from 'fractional-indexing';
import { addMonths, fmtWhen, parseYmd, ymd } from '@danbro96/lupira-domain-core/time';
import { wallToIso } from './zonedTime';

type DueFields = { dueOn?: string | null; dueAt?: string | null };

/** A set due: a whole day (`dueOn`, 'yyyy-MM-dd') or a timed instant (`dueAt`), never both. */
export type Due = { dueOn: string; dueAt?: null } | { dueOn?: null; dueAt: string };

/** What both clients need from a LupiraTasks item; structural so no wire type reaches this package. */
export type TaskLike = DueFields & {
  id: string;
  listId: string;
  title: string;
  status: string;
};

export type OpenDeadline = TaskLike & Due;

function hasDue<T extends DueFields>(t: T): t is T & Due {
  return t.dueOn != null || t.dueAt != null;
}

/** Cancelled is closed but `completed: false` server-side, so a completed=false fetch still returns it. */
export function isOpenDeadline(t: TaskLike): t is OpenDeadline {
  return hasDue(t) && t.status !== 'Cancelled';
}

/** A due means "done by", not "occurs at": a deadline pins to its LOCAL due day as an all-day entry. */
export function dueDay(d: Due): string {
  return d.dueOn != null ? d.dueOn : ymd(new Date(d.dueAt));
}

/** A date-only due is overdue once its local day has passed; a timed one once its instant has. */
export function isOverdue(d: Due, now: Date): boolean {
  return d.dueOn != null ? d.dueOn < ymd(now) : new Date(d.dueAt) < now;
}

/** A task that is still open past its deadline. */
export function isTaskOverdue(t: DueFields & { completed?: boolean | null }, now: Date): boolean {
  return hasDue(t) && !t.completed && isOverdue(t, now);
}

/** "Due 5 Oct 2026", "Due 5 Oct 2026 18:00", "… — overdue", or "No deadline". */
export function dueLine(t: DueFields & { completed?: boolean | null }, now: Date): string {
  if (!hasDue(t)) return 'No deadline';
  const when = t.dueOn != null ? fmtWhen(t.dueOn, true) : fmtWhen(t.dueAt, false);
  return `Due ${when}${isTaskOverdue(t, now) ? ' — overdue' : ''}`;
}

export function assigneeLabel(a: { displayName?: string | null; email: string }): string {
  return a.displayName || a.email;
}

/** Half-open ['yyyy-MM-dd', 'yyyy-MM-dd') due days covering a month ('yyyy-MM'). */
export function monthDayRange(monthKey: string): { fromDay: string; toDay: string } {
  const first = parseYmd(`${monthKey}-01`);
  return { fromDay: ymd(first), toDay: ymd(addMonths(first, 1)) };
}

export function taskDeepLink(listId: string, itemId: string): string {
  return `lupiratasks://task/${listId}/${itemId}`;
}

export function taskWebUrl(listId: string): string {
  return `https://tasks.lupira.com/lists/${listId}`;
}

/** The edge from a calendar item to a LupiraTasks item — the kind and type cal-api's task link tools use. */
export const TASK_RELATION = { toKind: 'task', relationType: 'derived-from' } as const;

export type TaskListLike = {
  id: string;
  name: string;
  access: string;
  isArchived: boolean;
  sortOrder?: string | null;
};

/** Lists a new task can go to, in the caller's own order: keyed lists first, the rest by name. */
export function writableTaskLists<T extends TaskListLike>(lists: T[]): T[] {
  return lists
    .filter((l) => !l.isArchived && l.access !== 'Viewer')
    .sort((a, b) => {
      if (a.sortOrder && b.sortOrder) return a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0;
      if (a.sortOrder || b.sortOrder) return a.sortOrder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function initialTaskListId(lists: TaskListLike[], lastId: string | null | undefined): string {
  return lists.find((l) => l.id === lastId)?.id ?? lists[0]?.id ?? '';
}

/** Order key that puts a new top-level task first, where Lupira Tasks inserts its own. */
export function newTaskSortOrder(items: { parentItemId?: string | null; sortOrder: string }[]): string {
  const first = items.filter((i) => !i.parentItemId).map((i) => i.sortOrder).sort()[0];
  return generateKeyBetween(null, first ?? null);
}

/** A picked due as the API takes it: a day alone is date-only, a day and a local 'HH:mm' a timed instant. */
export function dueFromPick(day: string | null, time: string | null): { dueOn: string | null; dueAt: string | null } {
  if (!day) return { dueOn: null, dueAt: null };
  return time ? { dueOn: null, dueAt: wallToIso(day, time, null) } : { dueOn: day, dueAt: null };
}

export function newTaskBody(
  id: string,
  title: string,
  due: { day: string | null; time: string | null },
  listItems: Parameters<typeof newTaskSortOrder>[0],
) {
  return { id, title: title.trim(), ...dueFromPick(due.day, due.time), sortOrder: newTaskSortOrder(listItems) };
}
