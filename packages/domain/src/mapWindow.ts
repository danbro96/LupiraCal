// The map's one age limit. Every dated layer — events, photos, hotspots, where you've been — reaches back the
// same distance; events also keep what's coming up, since a planned place is as useful as a visited one.

import { ymd } from './time';

export type MapSince = 'week' | 'month' | 'year' | 'all';

export const MAP_SINCE_LABELS: Record<MapSince, string> = { week: 'Week', month: 'Month', year: 'Year', all: 'All' };

const SINCE_DAYS: Record<Exclude<MapSince, 'all'>, number> = { week: 7, month: 30, year: 365 };
export const MAP_FUTURE_DAYS = 180;
const DAY_MS = 86_400_000;
/** "All" still needs a start for APIs that require one; nothing was recorded before the estate existed. */
export const MAP_ALL_FROM_YMD = '2000-01-01';
const ALL_FROM = new Date(`${MAP_ALL_FROM_YMD}T00:00:00Z`);
const MIN_BUCKET_S = 30;
const MAX_BUCKET_S = 3600;
const TRACK_POINTS = 21_000;

export interface MapWindow {
  /** Null = no lower bound. */
  from: Date | null;
  to: Date;
  eventsFromDay: string;
  eventsToDay: string;
  /** For APIs that need a start even when the answer is "everything". */
  movementFrom: Date;
}

export function mapWindow(since: MapSince, now: Date): MapWindow {
  const from = since === 'all' ? null : new Date(now.getTime() - SINCE_DAYS[since] * DAY_MS);
  return {
    from,
    to: now,
    eventsFromDay: from ? ymd(from) : '0000-01-01',
    eventsToDay: ymd(new Date(now.getTime() + MAP_FUTURE_DAYS * DAY_MS)),
    movementFrom: from ?? ALL_FROM,
  };
}

/** One best fix per bucket: a week keeps the recorder's 30 s resolution, and the bucket grows with the span so
 *  a longer window stays within ~21k points (a year: 25-minute buckets; the cap is an hour). */
export function trackBucketSeconds(from: Date, to: Date): number {
  const span = Math.max(0, (to.getTime() - from.getTime()) / 1000);
  return Math.min(MAX_BUCKET_S, Math.max(MIN_BUCKET_S, Math.ceil(span / TRACK_POINTS)));
}
