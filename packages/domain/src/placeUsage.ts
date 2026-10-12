import { ITEM_CATEGORIES, isItemCategory, type ItemCategory } from './itemCategory';

/** How your events have used one place: cal-api's `GET /place-usage` row. */
export interface PlaceUsage {
  placeId: string;
  label: string | null;
  eventCount: number;
  lastDay: string;
  byCategory: { category: ItemCategory; eventCount: number; lastDay: string }[];
  companions: { contactId: string; eventCount: number }[];
}

/** One occurrence at one place, as the mobile mirror's SQL yields it; an item's place and travel endpoints are
 *  separate rows, each place once per occurrence. */
export interface PlaceUsageRow {
  placeId: string;
  label?: string | null;
  category?: string | null;
  day: string;
  /** Attendees still present and not declined. */
  contactIds?: readonly string[] | null;
}

export const PLACE_USAGE_LIMIT = 200;
const MAX_COMPANIONS = 5;

interface Tally {
  eventCount: number;
  lastDay: string;
  label: string | null;
  labelDay: string;
  categories: Map<ItemCategory, { eventCount: number; lastDay: string }>;
  companions: Map<string, number>;
}

const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The server's fold over occurrence rows, so offline usage ranks places exactly as online usage does. */
export function foldUsageRows(rows: readonly PlaceUsageRow[], limit = PLACE_USAGE_LIMIT): PlaceUsage[] {
  const byPlace = new Map<string, Tally>();
  for (const row of rows) {
    const tally = byPlace.get(row.placeId)
      ?? { eventCount: 0, lastDay: '', label: null, labelDay: '', categories: new Map(), companions: new Map() };
    byPlace.set(row.placeId, tally);
    tally.eventCount += 1;
    if (row.day > tally.lastDay) tally.lastDay = row.day;
    const label = row.label?.trim() ? row.label : null;
    if (label !== null && (tally.label === null || row.day >= tally.labelDay)) {
      tally.label = label;
      tally.labelDay = row.day;
    }
    const category = isItemCategory(row.category) ? row.category : 'General';
    const prev = tally.categories.get(category);
    tally.categories.set(category, {
      eventCount: (prev?.eventCount ?? 0) + 1,
      lastDay: prev && prev.lastDay > row.day ? prev.lastDay : row.day,
    });
    for (const contactId of new Set(row.contactIds ?? [])) {
      tally.companions.set(contactId, (tally.companions.get(contactId) ?? 0) + 1);
    }
  }

  return [...byPlace]
    .sort(([aId, a], [bId, b]) => ordinal(b.lastDay, a.lastDay) || b.eventCount - a.eventCount || ordinal(aId, bId))
    .slice(0, limit)
    .map(([placeId, t]) => ({
      placeId,
      label: t.label,
      eventCount: t.eventCount,
      lastDay: t.lastDay,
      byCategory: [...t.categories]
        .sort(([aCat, a], [bCat, b]) => b.eventCount - a.eventCount || ordinal(b.lastDay, a.lastDay)
          || ITEM_CATEGORIES.indexOf(aCat) - ITEM_CATEGORIES.indexOf(bCat))
        .map(([category, c]) => ({ category, eventCount: c.eventCount, lastDay: c.lastDay })),
      companions: [...t.companions]
        .sort(([aId, a], [bId, b]) => b - a || ordinal(aId, bId))
        .slice(0, MAX_COMPANIONS)
        .map(([contactId, eventCount]) => ({ contactId, eventCount })),
    }));
}
