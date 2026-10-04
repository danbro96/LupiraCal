// Family identity and per-day parent rails for the calendar grids.

import { clampToDay } from './occurrences';
import { sameDay } from '@danbro96/lupira-domain-core/time';

export interface FamilyFields {
  itemId: string;
  parentItemId?: string | null;
  childCount?: number;
}

/** Groups an entry with its parent/children; undefined for standalone items. */
export function familyKey(e: FamilyFields): string | undefined {
  return e.parentItemId ?? ((e.childCount ?? 0) > 0 ? e.itemId : undefined);
}

export interface RailSource extends FamilyFields {
  title: string;
  start: Date;
  end: Date | null;
  isAllDay: boolean;
}

export interface DayRail {
  /** Parent item id — also the family key. */
  itemId: string;
  title: string;
  childCount: number;
  /** Vertical span in minutes for a timed parent; absent means all-day → full-column rail. */
  startMin?: number;
  endMin?: number;
}

export const MAX_RAILS_PER_DAY = 2;

/**
 * Spine rails for one day. All-day parents (childCount > 0) covering the day render a full-column
 * rail — same coverage predicate as the all-day chip strip so rails always match chips. Timed
 * parents render a rail spanning their own clamped time range, so an event with sub-events (a party,
 * a conference day) brackets its children. Recurring parents dedup by itemId; all-day rails sort
 * first, then timed by start; capped, extras dropped.
 */
export function railsForDay(entries: RailSource[], day: Date): DayRail[] {
  const seen = new Set<string>();
  const rails: { rail: DayRail; allDay: boolean; order: number }[] = [];
  for (const e of entries) {
    if ((e.childCount ?? 0) <= 0 || seen.has(e.itemId)) continue;
    if (e.isAllDay) {
      if (!(sameDay(e.start, day) || (e.end !== null && e.start <= day && e.end >= day))) continue;
      seen.add(e.itemId);
      rails.push({
        rail: { itemId: e.itemId, title: e.title, childCount: e.childCount ?? 0 },
        allDay: true,
        order: e.start.getTime(),
      });
    } else {
      const span = clampToDay(e.start, e.end ?? e.start, day);
      if (!span) continue;
      seen.add(e.itemId);
      rails.push({
        rail: { itemId: e.itemId, title: e.title, childCount: e.childCount ?? 0, startMin: span.startMin, endMin: span.endMin },
        allDay: false,
        order: span.startMin,
      });
    }
  }
  return rails
    .sort((a, b) =>
      a.allDay !== b.allDay
        ? a.allDay
          ? -1
          : 1
        : a.order - b.order || a.rail.itemId.localeCompare(b.rail.itemId),
    )
    .slice(0, MAX_RAILS_PER_DAY)
    .map((r) => r.rail);
}
