import type { DayGroup } from '@lupira/cal-domain/photoFormat';

/** The web lays a day out as a CSS grid; a recycling list needs the rows themselves, so this shape is the app's own. */
export type PhotoGridEntry<T> =
  | { kind: 'header'; day: DayGroup<T> }
  | { kind: 'row'; key: string; photos: T[] };

export interface PhotoGrid<T> {
  entries: PhotoGridEntry<T>[];
  headerIndices: number[];
}

export function photoGrid<T>(days: readonly DayGroup<T>[], columns: number): PhotoGrid<T> {
  const entries: PhotoGridEntry<T>[] = [];
  const headerIndices: number[] = [];
  for (const day of days) {
    headerIndices.push(entries.length);
    entries.push({ kind: 'header', day });
    for (let i = 0; i < day.items.length; i += columns) {
      entries.push({ kind: 'row', key: `${day.key}:${i}`, photos: day.items.slice(i, i + columns) });
    }
  }
  return { entries, headerIndices };
}
