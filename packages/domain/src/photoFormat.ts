/** Formatters for photo metadata, shared by the web and mobile galleries. */

import { plural } from '@danbro96/lupira-domain-core/wording';

const KB = 1024;

/** File size for a metadata line: "842 kB", "3.7 MB". Binary units, one decimal above kB. */
export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < KB) return `${Math.round(bytes)} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes / KB;
  let unit = 0;
  while (value >= KB && unit < units.length - 1) {
    value /= KB;
    unit++;
  }
  // Whole numbers past a thousand read as noise at one decimal ("1024.0 MB").
  return `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))} ${units[unit]}`;
}

/** Video length as a clock: "0:09", "1:23", "1:02:03". Seconds may be fractional. */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "4032 × 3024" — the × is deliberate, an ASCII x reads as a variable. */
export function fmtDimensions(width: number | null | undefined, height: number | null | undefined): string | null {
  return width && height ? `${width} × ${height}` : null;
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/**
 * Groups a page-flattened list into calendar days, preserving the incoming order — the server
 * already sorts, so a day boundary is just where the local date changes. The label is formatted by
 * the caller because the two galleries have very different widths to spend.
 */
export function groupByDay<T extends { takenAt: string }>(
  items: readonly T[],
  formatLabel: (date: Date) => string,
): DayGroup<T>[] {
  const days: DayGroup<T>[] = [];
  for (const item of items) {
    const date = new Date(item.takenAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const last = days.at(-1);
    if (last?.key === key) last.items.push(item);
    else days.push({ key, label: formatLabel(date), items: [item] });
  }
  return days;
}

/** photoId → the calendar items linked to it, from one edge list rather than a call per tile. */
export function photoEventLinks(
  edges: readonly { toRef: string; fromId: string }[],
): Map<string, string[]> {
  const byPhoto = new Map<string, string[]>();
  for (const edge of edges) {
    byPhoto.set(edge.toRef, [...(byPhoto.get(edge.toRef) ?? []), edge.fromId]);
  }
  return byPhoto;
}

/** Presigned thumbnail URLs live 24 h; a list cached longer than this starts serving dead ones. */
export const THUMB_SAFE_STALE_MS = 15 * 60_000;

/** A day's most photographed places, most first — ties keep first-seen order. */
export function topPlaces(items: readonly { placeLabel?: string | null }[], max: number): string[] {
  const counts = new Map<string, number>();
  for (const { placeLabel } of items) {
    if (placeLabel) counts.set(placeLabel, (counts.get(placeLabel) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([label]) => label);
}

/** Distinct event ids linked to any of the photos, in first-seen order. */
export function linkedEventIds(photoIds: readonly string[], links: ReadonlyMap<string, readonly string[]>): string[] {
  const ids = new Set<string>();
  for (const id of photoIds) for (const eventId of links.get(id) ?? []) ids.add(eventId);
  return [...ids];
}

/** Whole days until a trashed photo is purged, never negative — "3 days left". */
export function daysLeft(purgesAt: string, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(purgesAt) - now.getTime()) / 86_400_000));
}

export function photoCount(n: number): string {
  return plural(n, 'photo');
}

/** A bulk action's result: "Trashed 3 photos", or "Trashed 2, 1 failed" when some failed. */
export function outcomeMessage(verb: string, { done, failed }: { done: number; failed: number }): string {
  return failed > 0 ? `${verb} ${done}, ${failed} failed` : `${verb} ${photoCount(done)}`;
}

export function fmtDays(n: number): string {
  return plural(n, 'day');
}

/** HEIC originals are stored untranscoded and neither client decodes them — the thumbnail stands in. */
export function originalIsViewable(contentType: string | null | undefined): boolean {
  return contentType !== 'image/heic' && contentType !== 'image/heif';
}

export function geotagLabel(source: string | null | undefined): string {
  return source === 'ExifGps' ? 'From the camera' : 'Matched from your location history';
}

/** The photos not yet linked to the event — the ones a link call sends, and an Undo unlinks. */
export function unlinkedPhotoIds(photoIds: readonly string[], links: ReadonlyMap<string, readonly string[]>, itemId: string): string[] {
  return photoIds.filter((id) => !links.get(id)?.includes(itemId));
}

export function purgeWarning(n: number): string {
  return n === 1
    ? 'This removes the original and its thumbnail from storage. It cannot be undone.'
    : 'This removes the originals and their thumbnails from storage. It cannot be undone.';
}

/** "In trash · deleted for good in 3 days" */
export function inTrashLine(purgesAt: string, now: Date): string {
  return `In trash · deleted for good in ${fmtDays(daysLeft(purgesAt, now))}`;
}

/** The trashed tile's badge: "3 days left". */
export function trashBadge(purgesAt: string, now: Date): string {
  return `${fmtDays(daysLeft(purgesAt, now))} left`;
}

/** A day group's heading: "Sat 4 Oct 2026" — the weekday helps place a day, the short form fits a phone. */
export function photoDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
