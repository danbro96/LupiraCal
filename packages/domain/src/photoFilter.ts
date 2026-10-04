/** The photo API's list filters, applied client-side to a set the list endpoint can't express — an
 *  event's photos arrive by id from `/photos/lookup`. Mirrors the server: place is a case-insensitive
 *  substring, both instant bounds are inclusive, and duplicates stay hidden unless asked for by name. */

export interface PhotoFilterable {
  kind: string;
  status: string;
  takenAt: string;
  latitude?: number | null;
  placeLabel?: string | null;
}

export interface PhotoCriteria {
  sort: 'TakenAtDesc' | 'TakenAtAsc';
  kind?: string;
  status?: string;
  located?: boolean;
  place?: string;
  fromIso?: string;
  toIso?: string;
}

export function filterPhotos<T extends PhotoFilterable>(items: readonly T[], c: PhotoCriteria): T[] {
  const place = c.place?.trim().toLocaleLowerCase();
  const from = c.fromIso ? Date.parse(c.fromIso) : -Infinity;
  const to = c.toIso ? Date.parse(c.toIso) : Infinity;
  const kept = items.filter((p) => {
    if (c.kind && p.kind !== c.kind) return false;
    if (c.status ? p.status !== c.status : p.status === 'Duplicate') return false;
    if (c.located !== undefined && (p.latitude != null) !== c.located) return false;
    if (place && !p.placeLabel?.toLocaleLowerCase().includes(place)) return false;
    const t = Date.parse(p.takenAt);
    return t >= from && t <= to;
  });
  const direction = c.sort === 'TakenAtAsc' ? 1 : -1;
  return kept.sort((a, b) => direction * (Date.parse(a.takenAt) - Date.parse(b.takenAt)));
}

/** What an empty grid says. An event filter on its own is a question about that event's photos; with other
 *  filters it is just one more constraint. `located: false` (the unplaced photos) is a filter too. */
export function photoEmptyText(f: {
  trashed?: boolean; event?: string | null; kind?: string | null; located?: boolean | null;
  place?: string | null; status?: string | null; from?: string | null;
}): string {
  if (f.trashed) return 'Trash is empty.';
  const others = !!f.kind || f.located != null || !!f.place || !!f.status || !!f.from;
  if (f.event && !others) return 'No photos linked to this event yet.';
  return f.event || others ? 'No photos match these filters.' : 'No photos yet.';
}
