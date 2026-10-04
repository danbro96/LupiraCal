// The map's jump strip: your current home and work, your parents' home, then the next placed events. Both apps assemble it from
// their own sources (mirror rows on mobile, API occurrences on web) and render the same chips.

import { residencyStatus, type FuzzyDate } from './fuzzyDate';
import type { GeoPoint } from './geo';
import { displayTitle } from './itemLabels';
import { placeSpanM } from './mapZoom';
import { fmtDayShort, fmtTime, isToday } from './time';

export const QUICK_EVENTS_SHOWN = 5;
/** Some upcoming places won't resolve to a point; fetching more keeps the strip full. */
export const QUICK_EVENT_CANDIDATES = 10;

export interface QuickPlacePlace {
  name?: string | null;
  kind?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface UpcomingPlacedEvent {
  itemId: string;
  title: string | null;
  start: string;
  placeId: string;
  color: string | null;
}

export type QuickPlace = {
  key: string;
  kind: 'home' | 'work' | 'parents' | 'event';
  label: string;
  /** Null until the place resolves — offline, or never geocoded. */
  point: GeoPoint | null;
  /** Ground a jump should frame (`mapZoom`). */
  spanM: number;
  event?: { itemId: string; title: string | null; start: string; color: string | null };
};

export function quickPlaces({ ownAddresses, parents = [], places, upcoming, now = new Date() }: {
  ownAddresses: readonly { placeId: string; type?: string | null; movedIn?: FuzzyDate | null; movedOut?: FuzzyDate | null }[];
  /** Your parents' homes (`parentsHomes`). */
  parents?: readonly { placeId: string; label: string }[];
  places: ReadonlyMap<string, QuickPlacePlace>;
  upcoming: readonly UpcomingPlacedEvent[];
  now?: Date;
}): QuickPlace[] {
  const pointOf = (placeId: string): GeoPoint | null => {
    const p = places.get(placeId);
    return p?.latitude != null && p.longitude != null ? { lat: p.latitude, lon: p.longitude } : null;
  };
  const own = ownAddresses
    .filter((a) => (a.type === 'Home' || a.type === 'Work') && residencyStatus(a.movedIn, a.movedOut, now) === 'active')
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'Home' ? -1 : 1));
  const typeCount = (type: string) => own.filter((a) => a.type === type).length;

  // A home stays even unresolved — it's still yours; an event that can't be placed is just dropped.
  const homes: QuickPlace[] = own.map((a) => {
    const type = a.type === 'Home' ? 'Home' : 'Work';
    const name = places.get(a.placeId)?.name;
    return {
      key: `${type}:${a.placeId}`,
      kind: type === 'Home' ? 'home' : 'work',
      label: typeCount(a.type!) > 1 && name ? `${type} · ${name}` : type,
      point: pointOf(a.placeId),
      spanM: placeSpanM(places.get(a.placeId)),
    };
  });
  const events: QuickPlace[] = upcoming.flatMap((e) => {
    const point = pointOf(e.placeId);
    if (!point) return [];
    const start = new Date(e.start);
    return [{
      key: `event:${e.itemId}`,
      kind: 'event' as const,
      label: `${displayTitle(e.title)} · ${isToday(start) ? fmtTime(start) : fmtDayShort(start)}`,
      point,
      spanM: placeSpanM(places.get(e.placeId)),
      event: { itemId: e.itemId, title: e.title, start: e.start, color: e.color },
    }];
  }).slice(0, QUICK_EVENTS_SHOWN);

  const parentsPlaces: QuickPlace[] = parents.map((p) => ({
    key: `parents:${p.placeId}`,
    kind: 'parents',
    label: p.label,
    point: pointOf(p.placeId),
    spanM: placeSpanM(places.get(p.placeId)),
  }));
  return [...homes, ...parentsPlaces, ...events];
}

/** From API occurrences: one per item (a series by its next occurrence), placed, not cancelled, not over. */
export function nextPlacedEvents<T extends {
  id: string; title?: string | null; start: string; end?: string | null; placeId?: string | null; status?: string | null;
}>(occurrences: readonly T[], now: Date, limit = QUICK_EVENT_CANDIDATES): T[] {
  const t = now.getTime();
  const seen = new Set<string>();
  return [...occurrences]
    .filter((o) => o.placeId && o.status !== 'Cancelled' && Date.parse(o.end ?? o.start) >= t)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .filter((o) => !seen.has(o.id) && !!seen.add(o.id))
    .slice(0, limit);
}
