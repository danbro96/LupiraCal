import { describe, expect, it } from 'vitest';
import { bboxOf, bboxToParam, durationMin, haversineM, mapViewport, padBbox, splitTrack, trackWindowFrozen } from './geo';

describe('haversineM', () => {
  it('is zero for identical points', () => {
    expect(haversineM({ lat: 59.3293, lon: 18.0686 }, { lat: 59.3293, lon: 18.0686 })).toBe(0);
  });

  it('measures Stockholm→Gothenburg within 1%', () => {
    const d = haversineM({ lat: 59.3293, lon: 18.0686 }, { lat: 57.7089, lon: 11.9746 });
    expect(d).toBeGreaterThan(395_000);
    expect(d).toBeLessThan(405_000);
  });
});

describe('bboxOf / padBbox / bboxToParam', () => {
  it('returns null for no points', () => {
    expect(bboxOf([])).toBeNull();
  });

  it('bounds a point set in [minLon, minLat, maxLon, maxLat] order', () => {
    const box = bboxOf([
      { lat: 59.3, lon: 18.0 },
      { lat: 59.5, lon: 17.8 },
      { lat: 59.1, lon: 18.2 },
    ]);
    expect(box).toEqual([17.8, 59.1, 18.2, 59.5]);
  });

  it('pads proportionally and gives a degenerate point box a fixed pad', () => {
    expect(padBbox([10, 50, 12, 51], 0.5)).toEqual([9, 49.5, 13, 51.5]);
    const [minLon, minLat, maxLon, maxLat] = padBbox([18, 59, 18, 59], 0.2);
    expect(maxLon).toBeGreaterThan(minLon);
    expect(maxLat).toBeGreaterThan(minLat);
  });

  it('bboxToParam preserves order for the repeated query param', () => {
    expect(bboxToParam([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });
});

describe('splitTrack', () => {
  const at = (min: number, activity?: string) => ({
    lat: 59 + min / 1000,
    lon: 18,
    ts: new Date(Date.UTC(2026, 0, 1, 12, min)).toISOString(),
    activity,
  });

  it('keeps a gap-free single-activity track as one segment', () => {
    const segments = splitTrack([at(0, 'Walk'), at(1, 'Walk'), at(2, 'Walk')], 300);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(3);
  });

  it('breaks on a recording gap without bridging', () => {
    const segments = splitTrack([at(0), at(1), at(30), at(31)], 300);
    expect(segments.map((s) => s.length)).toEqual([2, 2]);
  });

  it('breaks on an activity change and repeats the handover point', () => {
    const segments = splitTrack([at(0, 'Walk'), at(1, 'Walk'), at(2, 'Vehicle'), at(3, 'Vehicle')], 300);
    expect(segments).toHaveLength(2);
    expect(segments[0].map((p) => p.ts)).toEqual([at(0).ts, at(1).ts]);
    // Continuous line: the Vehicle segment starts where the Walk segment ended.
    expect(segments[1].map((p) => p.ts)).toEqual([at(1).ts, at(2).ts, at(3).ts]);
  });

  it('treats a simultaneous gap + activity change as a hole, not a handover', () => {
    const segments = splitTrack([at(0, 'Walk'), at(30, 'Vehicle')], 300);
    expect(segments.map((s) => s.length)).toEqual([1, 1]);
  });

  it('returns no segments for an empty track', () => {
    expect(splitTrack([], 300)).toEqual([]);
  });
});

describe('durationMin', () => {
  it('floors to whole minutes and never goes negative', () => {
    expect(durationMin('2026-01-01T12:00:00Z', '2026-01-01T12:59:59Z')).toBe(59);
    expect(durationMin('2026-01-01T13:00:00Z', '2026-01-01T12:00:00Z')).toBe(0);
  });
});

describe('trackWindowFrozen', () => {
  const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12);

  it('freezes a window that ended before yesterday', () => {
    expect(trackWindowFrozen('2026-03-01T10:00:00Z', noon(2026, 2, 10))).toBe(true);
  });

  it('leaves yesterday and today open — the rollup still reworks them', () => {
    const now = noon(2026, 2, 10);
    expect(trackWindowFrozen(new Date(2026, 2, 9, 12).toISOString(), now)).toBe(false);
    expect(trackWindowFrozen(new Date(2026, 2, 10, 11).toISOString(), now)).toBe(false);
  });

  // `midnight - 24h` lands an hour off on the day after a DST shift; the boundary has to come from
  // the calendar. Only meaningful under a DST timezone, which is why the assertion is on the
  // calendar day rather than a fixed offset.
  it('takes start-of-yesterday from the calendar, not a fixed 24 hours', () => {
    const dayAfterSpringForward = noon(2026, 2, 30);
    const startOfYesterday = new Date(dayAfterSpringForward);
    startOfYesterday.setHours(0, 0, 0, 0);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    expect(trackWindowFrozen(new Date(startOfYesterday.getTime() - 1).toISOString(), dayAfterSpringForward)).toBe(true);
    expect(trackWindowFrozen(startOfYesterday.toISOString(), dayAfterSpringForward)).toBe(false);
  });
});

describe('mapViewport', () => {
  it('rounds the bbox and zoom', () => {
    expect(mapViewport([18.123456, 59.2, 18.5, 59.45678], 11.23456)).toEqual({ bbox: '18.1235,59.2000,18.5000,59.4568', zoom: 11.23 });
  });

  it('clamps a world-wrapped view to what the bbox parsers accept', () => {
    expect(mapViewport([-250.5, -91, 250.5, 91], 0.4).bbox).toBe('-180.0000,-90.0000,180.0000,90.0000');
  });
});
