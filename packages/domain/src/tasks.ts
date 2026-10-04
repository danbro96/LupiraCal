import { fmtWhen, ymd } from '@danbro96/lupira-domain-core/time';

/** What both clients need from a LupiraTasks item; structural so no wire type reaches this package. */
export type TaskLike = {
  id: string;
  listId: string;
  title: string;
  dueAt?: string | null;
  status: string;
};

export type OpenDeadline = TaskLike & { dueAt: string };

/** Cancelled is closed but `completed: false` server-side, so a completed=false fetch still returns it. */
export function isOpenDeadline(t: TaskLike): t is OpenDeadline {
  return !!t.dueAt && t.status !== 'Cancelled';
}

/** `dueAt` means "done by", not "occurs at": a deadline pins to its LOCAL due day as an all-day entry. */
export function dueDay(dueAt: string): string {
  return ymd(new Date(dueAt));
}

export function isOverdue(dueAt: string, now: Date): boolean {
  return new Date(dueAt) < now;
}

/** A task that is still open past its deadline. */
export function isTaskOverdue(t: { dueAt?: string | null; completed?: boolean | null }, now: Date): boolean {
  return !!t.dueAt && !t.completed && isOverdue(t.dueAt, now);
}

/** "Due 5 Oct 2026 18:00", "… — overdue", or "No deadline". */
export function dueLine(t: { dueAt?: string | null; completed?: boolean | null }, now: Date): string {
  if (!t.dueAt) return 'No deadline';
  return `Due ${fmtWhen(t.dueAt, false)}${isTaskOverdue(t, now) ? ' — overdue' : ''}`;
}

export function assigneeLabel(a: { displayName?: string | null; email: string }): string {
  return a.displayName || a.email;
}

/** Half-open [dueFrom, dueTo) covering the LOCAL month, in the ISO instants the API filters on. */
export function monthUtcRange(monthKey: string): { dueFrom: string; dueTo: string } {
  const [y, m] = monthKey.split('-').map(Number);
  return {
    dueFrom: new Date(y, m - 1, 1).toISOString(),
    dueTo: new Date(y, m, 1).toISOString(),
  };
}

export function taskDeepLink(listId: string, itemId: string): string {
  return `lupiratasks://task/${listId}/${itemId}`;
}

export function taskWebUrl(listId: string): string {
  return `https://tasks.lupira.com/lists/${listId}`;
}
