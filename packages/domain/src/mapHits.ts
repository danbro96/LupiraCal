// What a tap on the map touched, from the rendered features under the finger. Pins of different layers stack
// on one spot (a contact's home, events there, photos taken there), so a tap yields a list, not one feature.
// MapLibre hands feature properties back through the native bridge with nested values stringified, so every
// read tolerates both forms.

import type { Feature } from 'geojson';
import type { Bbox } from './geo';

export interface HitPoint {
  lon: number;
  lat: number;
}

export type MapHit =
  | { kind: 'event'; key: string; point: HitPoint; itemId: string; title: string | null; start: string | null; color: string | null }
  | { kind: 'contact'; key: string; point: HitPoint; contactId: string; name: string; placeName: string | null; addressType: string | null }
  | { kind: 'photo'; key: string; point: HitPoint; photoId: string; takenAt: string; placeLabel: string | null; thumbUrl: string | null }
  | { kind: 'photoCell'; key: string; point: HitPoint; count: number; bounds: Bbox }
  | { kind: 'saved'; key: string; point: HitPoint; label: string; placeId: string | null }
  | {
      kind: 'hotspot'; key: string; point: HitPoint; label: string | null;
      activeDays: number; eventCount: number; photoCount: number; firstDay: string; lastDay: string;
    }
  | { kind: 'visit'; key: string; point: HitPoint; placeLabel: string | null; arriveTs: string; departTs: string; durationMin: number };

export type MapHitKind = MapHit['kind'];

/** Most specific first: what you tapped is more likely a thing than a statistic about the spot. */
const ORDER: MapHitKind[] = ['event', 'contact', 'photo', 'photoCell', 'saved', 'visit', 'hotspot'];

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
function json<T>(v: unknown): T | null {
  if (typeof v !== 'string') return (v as T) ?? null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

function pointOf(f: Feature): HitPoint | null {
  if (f.geometry?.type !== 'Point') return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lon, lat };
}

/** A household pin becomes one hit per resident. Features without a known layer (clusters, tracks) are skipped. */
export function hitsFromFeatures(features: readonly Feature[]): MapHit[] {
  const hits: MapHit[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const point = pointOf(f);
    if (!point || p.cluster) continue;
    switch (p.layer) {
      case 'event': {
        const itemId = str(p.itemId);
        if (itemId) hits.push({ kind: 'event', key: `event:${itemId}`, point, itemId, title: str(p.title), start: str(p.start), color: str(p.color) });
        break;
      }
      case 'contact': {
        const ids = json<string[]>(p.contactIds) ?? [];
        const names = json<string[]>(p.names) ?? [];
        const types = json<string[]>(p.addressTypes) ?? [];
        ids.forEach((contactId, i) => hits.push({
          kind: 'contact', key: `contact:${contactId}:${str(p.placeId) ?? ''}`, point, contactId,
          name: names[i] ?? 'Contact', placeName: str(p.placeName), addressType: types[i] ?? null,
        }));
        break;
      }
      case 'photo': {
        if (num(p.count) > 1) {
          const bounds = json<Bbox>(p.bounds);
          if (bounds) hits.push({ kind: 'photoCell', key: `cell:${point.lon},${point.lat}`, point, count: num(p.count), bounds });
        } else {
          const photoId = str(p.photoId);
          const takenAt = str(p.takenAt);
          if (photoId && takenAt) {
            hits.push({ kind: 'photo', key: `photo:${photoId}`, point, photoId, takenAt, placeLabel: str(p.placeLabel), thumbUrl: str(p.thumbUrl) });
          }
        }
        break;
      }
      case 'saved':
        hits.push({ kind: 'saved', key: `saved:${str(p.savedPlaceId) ?? str(p.label)}`, point, label: str(p.label) ?? 'Saved place', placeId: str(p.placeId) });
        break;
      case 'hotspot':
        hits.push({
          kind: 'hotspot', key: `hotspot:${str(p.hotspotId) ?? `${point.lon},${point.lat}`}`, point, label: str(p.label),
          activeDays: num(p.activeDays), eventCount: num(p.eventCount), photoCount: num(p.photoCount),
          firstDay: str(p.firstDay) ?? '', lastDay: str(p.lastDay) ?? '',
        });
        break;
      case 'visit':
        hits.push({
          kind: 'visit', key: `visit:${str(p.visitId) ?? str(p.arriveTs)}`, point, placeLabel: str(p.placeLabel),
          arriveTs: str(p.arriveTs) ?? '', departTs: str(p.departTs) ?? '', durationMin: num(p.durationMin),
        });
        break;
    }
  }
  const unique = [...new Map(hits.map((h) => [h.key, h])).values()];
  return unique.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
