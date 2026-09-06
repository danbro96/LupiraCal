import { addDays, parseYmd, startOfDay } from './time';

/** The time span whose photos an event might depict — both galleries derive suggestions from this,
 *  so they must agree. Structural input, not a generated DTO. */

/** A photo taken walking in, or just after the goodbyes, still belongs to the event. */
const PAD_MS = 15 * 60_000;

/** An event with neither an end nor an all-day date covers this much. */
const DEFAULT_SPAN_MS = 60 * 60_000;

export interface PhotoWindowSource {
  isAllDay?: boolean | null;
  startsAt?: string | null;
  endsAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface PhotoWindow {
  fromIso: string;
  toIso: string;
}

/** Null when the item has no start — there is nothing to search around. */
export function eventPhotoWindow(item: PhotoWindowSource): PhotoWindow | null {
  if (item.isAllDay) {
    if (!item.startDate) return null;
    const from = startOfDay(parseYmd(item.startDate));
    // endDate is inclusive, so the window runs to the start of the day after it.
    const to = addDays(startOfDay(parseYmd(item.endDate ?? item.startDate)), 1);
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  }

  if (!item.startsAt) return null;
  const start = Date.parse(item.startsAt);
  if (Number.isNaN(start)) return null;
  const parsedEnd = item.endsAt ? Date.parse(item.endsAt) : NaN;
  const end = Number.isNaN(parsedEnd) || parsedEnd <= start ? start + DEFAULT_SPAN_MS : parsedEnd;

  return {
    fromIso: new Date(start - PAD_MS).toISOString(),
    toIso: new Date(end + PAD_MS).toISOString(),
  };
}
