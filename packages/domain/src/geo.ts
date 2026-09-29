// Map math over plain {lat, lon} literals (primitives only; domain stays independent of the generated API models).
// Longitude spans here assume the Nordics — no antimeridian handling.

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** [minLon, minLat, maxLon, maxLat] — the axis order LupiraGeoApi's `bbox` query params take. */
export type Bbox = [number, number, number, number];

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in meters (haversine). */
export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Tight bbox around the points, or null for an empty list. */
export function bboxOf(points: readonly GeoPoint[]): Bbox | null {
  if (points.length === 0) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const p of points) {
    if (p.lon < minLon) minLon = p.lon;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lon > maxLon) maxLon = p.lon;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

/** Grow a bbox by `factor` of its span per side (a degenerate point box gets a small fixed pad). */
export function padBbox([minLon, minLat, maxLon, maxLat]: Bbox, factor: number): Bbox {
  const lonPad = (maxLon - minLon) * factor || 0.01;
  const latPad = (maxLat - minLat) * factor || 0.01;
  return [minLon - lonPad, minLat - latPad, maxLon + lonPad, maxLat + latPad];
}

export interface MapViewport {
  bbox: string;
  zoom: number;
}

/** A viewport as the APIs' `minLon,minLat,maxLon,maxLat` string plus its zoom. Clamped, since a world-wrapped view
 *  reports longitudes past ±180 that the bbox parsers reject; rounded (~11 m) so camera drift doesn't churn query keys. */
export function mapViewport([west, south, east, north]: Bbox, zoom: number): MapViewport {
  const clamp = (n: number, limit: number) => Math.min(limit, Math.max(-limit, n)).toFixed(4);
  return {
    bbox: [clamp(west, 180), clamp(south, 90), clamp(east, 180), clamp(north, 90)].join(','),
    zoom: Math.round(zoom * 100) / 100,
  };
}

/** The repeated-param form LupiraGeoApi expects: bbox=minLon&bbox=minLat&bbox=maxLon&bbox=maxLat. */
export function bboxToParam(bbox: Bbox): number[] {
  return [...bbox];
}

export interface TrackPointLike extends GeoPoint {
  /** ISO timestamp. */
  ts: string;
  activity?: string | null;
}

/**
 * Split a time-ordered track into drawable segments: break on a recording gap larger than `maxGapS`
 * (tracker off, retention hole) and on an activity change (so segments can be colored per mode).
 * Single-point segments are kept — the renderer decides whether a lone point draws.
 */
export function splitTrack<T extends TrackPointLike>(points: readonly T[], maxGapS: number): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];
  let prev: T | undefined;
  for (const p of points) {
    const gapS = prev ? (Date.parse(p.ts) - Date.parse(prev.ts)) / 1000 : 0;
    const activityChanged = prev !== undefined && (prev.activity ?? null) !== (p.activity ?? null);
    if (prev !== undefined && (gapS > maxGapS || activityChanged)) {
      segments.push(current);
      // An activity change is a handover, not a hole — the new segment continues from the previous point.
      current = activityChanged && gapS <= maxGapS ? [prev] : [];
    }
    current.push(p);
    prev = p;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/** Whole minutes between two ISO timestamps (floored, never negative). */
export function durationMin(fromIso: string, toIso: string): number {
  return Math.max(0, Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
}

/**
 * Whether a GPS window can no longer change: raw fixes are append-only and the visit/trip rollup
 * only reworks yesterday and today, so anything ending before yesterday is frozen and cacheable
 * forever. Callers turn this into their own cache policy.
 *
 * Start-of-yesterday must come from the calendar, not `midnight - 24h` — a DST transition makes the
 * day 23 or 25 hours long and the arithmetic lands in the wrong day.
 */
export function trackWindowFrozen(toIso: string, now: Date = new Date()): boolean {
  const startOfYesterday = new Date(now);
  startOfYesterday.setHours(0, 0, 0, 0);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  return Date.parse(toIso) < startOfYesterday.getTime();
}
