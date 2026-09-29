import type { CalendarItemDto, CalendarItemOccurrenceDto, ContainerDto, ItemStatus, OccurrenceOrigin } from '@lupira/cal-api/models';
import { displayTitle } from '@lupira/cal-domain/itemLabels';
import { isOverdue } from '@lupira/cal-domain/tasks';
import { parseYmd, sameDay, ymd } from '@lupira/cal-domain/time';
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
  /** Set for all-day entries: the days covered, compared as dates — an all-day instant is UTC midnight. */
  dayRange?: DayRange;
  color: string;
  icon?: IconName;
  ghost?: boolean;
  status?: ItemStatus | null;
  /** The occurrence's place, as the server labels it. */
  place?: string | null;
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
    title: displayTitle(o.title),
    start: new Date(o.start),
    end: o.end ? new Date(o.end) : null,
    isAllDay: o.isAllDay,
    dayRange: o.isAllDay ? isoDayRange(o.start, o.end) : undefined,
    color: calendarColor(calendar),
    icon: calendar.class === 'System' && calendar.kind ? CALENDAR_KIND_ICONS[calendar.kind] : undefined,
    status: o.status,
    place: o.locationLabel,
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
    title: displayTitle(t.title),
    start: new Date(due.getFullYear(), due.getMonth(), due.getDate()),
    end: null,
    isAllDay: true,
    dayRange: { first: ymd(due), last: ymd(due) },
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
    title: displayTitle(item.title),
    start,
    end,
    isAllDay: item.isAllDay,
    dayRange: item.isAllDay && item.startDate ? { first: item.startDate, last: item.endDate ?? item.startDate } : undefined,
    color: calendarColor(calendar),
    ghost: true,
    parentItemId: item.parentItemId ?? null,
    childCount: 0,
  };
}

/** Inclusive 'yyyy-MM-dd' bounds of an all-day span. */
export interface DayRange {
  first: string;
  last: string;
}

/** An all-day occurrence's days from its instants: the server sends each day as 00:00Z and the end as the
 *  inclusive last day, so the date part is the day in every time zone. */
export function isoDayRange(start: string, end?: string | null): DayRange {
  return { first: start.slice(0, 10), last: (end ?? start).slice(0, 10) };
}

/** Whether an entry covers a day. All-day spans compare dates; timed ones overlap the local day. */
export function coversDay(e: { start: Date; end: Date | null; dayRange?: DayRange }, day: Date): boolean {
  if (e.dayRange) {
    const key = ymd(day);
    return key >= e.dayRange.first && key <= e.dayRange.last;
  }
  if (e.end && e.end > e.start) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    return e.start < dayEnd && e.end > dayStart;
  }
  return sameDay(e.start, day);
}

/** An availability segment as coversDay reads it. */
export function segmentSpan(s: { start: string; end?: string | null; isAllDay: boolean }) {
  return {
    start: new Date(s.start),
    end: s.end ? new Date(s.end) : null,
    dayRange: s.isAllDay ? isoDayRange(s.start, s.end) : undefined,
  };
}
