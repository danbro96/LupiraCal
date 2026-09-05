import type { CalendarItemDto, CalendarItemOccurrenceDto, ContainerDto, OccurrenceOrigin } from '@lupira/cal-api/models';
import { isOverdue } from '@lupira/cal-domain/tasks';
import { parseYmd } from '@lupira/cal-domain/time';
import type { OpenTask } from '../state/useTaskDeadlines';
import type { IconName } from '@lupira/cal-tokens/icons';
import { CALENDAR_KIND_ICONS, calendarColor } from './theme/kinds';

/** One renderable occurrence on a grid — accepted occurrences, ghosted proposed items, task deadlines. */
export interface GridEntry {
  key: string;
  itemId: string;
  title: string;
  start: Date;
  end: Date | null;
  isAllDay: boolean;
  color: string;
  icon?: IconName;
  ghost?: boolean;
  completeness?: number | null;
  parentItemId: string | null;
  parentTitle?: string | null;
  childCount: number;
  /** Provenance for read-time projections (birthdays → a contact); routes the click to a read-only view. */
  origin?: OccurrenceOrigin | null;
  /** LupiraTasks provenance (not a cal item; generated OriginKind can't carry it) — routes the click to the TaskCard. */
  task?: { listId: string; itemId: string; dueAt: Date; overdue: boolean };
}

export function fromOccurrence(o: CalendarItemOccurrenceDto, calendar: ContainerDto): GridEntry {
  return {
    key: `${o.id}:${o.start}`,
    itemId: o.id,
    title: o.title || '(untitled)',
    start: new Date(o.start),
    end: o.end ? new Date(o.end) : null,
    isAllDay: o.isAllDay,
    color: calendarColor(calendar),
    icon: calendar.class === 'System' && calendar.kind ? CALENDAR_KIND_ICONS[calendar.kind] : undefined,
    completeness: o.completeness ? o.completeness.score : null,
    parentItemId: o.parentItemId ?? null,
    parentTitle: o.parentTitle,
    childCount: o.childCount,
    origin: o.origin,
  };
}

/** A task deadline pinned to its due day's all-day strip — `dueAt` means "done by", not "occurs at",
 *  so a timed block at the due instant would mislead; the exact time lives in the TaskCard. */
export function fromTask(t: OpenTask, now: Date): GridEntry {
  const due = new Date(t.dueAt);
  const overdue = isOverdue(t.dueAt, now);
  return {
    key: `task:${t.id}`,
    itemId: t.id,
    title: t.title || '(untitled)',
    start: new Date(due.getFullYear(), due.getMonth(), due.getDate()),
    end: null,
    isAllDay: true,
    color: overdue ? 'var(--mui-palette-error-main)' : 'var(--mui-palette-text-secondary)',
    icon: 'schedule',
    parentItemId: null,
    childCount: 0,
    task: { listId: t.listId, itemId: t.id, dueAt: due, overdue },
  };
}

/** A proposed item ghosted at its (first) date; recurring proposals ghost once. */
export function fromProposed(item: CalendarItemDto, calendar: ContainerDto): GridEntry | null {
  const start = item.startsAt ? new Date(item.startsAt) : item.startDate ? parseYmd(item.startDate) : null;
  if (!start) return null;
  const end = item.endsAt ? new Date(item.endsAt) : null;
  return {
    key: `ghost:${item.id}:${calendar.id}`,
    itemId: item.id,
    title: item.title || '(untitled)',
    start,
    end,
    isAllDay: item.isAllDay,
    color: calendarColor(calendar),
    ghost: true,
    parentItemId: item.parentItemId ?? null,
    childCount: 0,
  };
}
