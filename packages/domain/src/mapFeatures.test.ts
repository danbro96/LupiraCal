import { describe, expect, it } from 'vitest';
import {
  abbreviateCount,
  contactFeatures,
  contactPinLabel,
  eventFeatures,
  hotspotFeatures,
  hotspotStats,
  photoCellBounds,
  photoFeatures,
  savedPlaceFeatures,
  trackFeatures,
  visitFeatures,
  type PlacePoint,
} from './mapFeatures';

const places = new Map<string, PlacePoint>([
  ['home', { id: 'home', name: 'Home', longitude: 18.0, latitude: 59.3 }],
  ['work', { id: 'work', name: 'Work', longitude: 18.1, latitude: 59.4 }],
  ['ungeocoded', { id: 'ungeocoded', name: 'Somewhere', longitude: null, latitude: null }],
]);

const props = (fc: { features: { properties: unknown }[] }, i = 0) =>
  fc.features[i].properties as Record<string, unknown>;

describe('eventFeatures', () => {
  it('draws one pin per item and place, however many occurrences repeat', () => {
    const { features } = eventFeatures(
      [
        { itemId: 'i1', title: 'Standup', start: '2026-01-01T09:00:00Z', placeId: 'home' },
        { itemId: 'i1', title: 'Standup', start: '2026-01-02T09:00:00Z', placeId: 'home' },
        { itemId: 'i1', title: 'Standup', start: '2026-01-03T09:00:00Z', placeId: 'work' },
      ],
      places,
    );
    expect(features.features).toHaveLength(2);
  });

  it('counts a free-text location as unmappable, but never an unresolved placeId', () => {
    const labelOnly = eventFeatures(
      [{ itemId: 'i1', start: 's', placeId: null, hasLocationLabel: true }],
      places,
    );
    expect(labelOnly.unmappableCount).toBe(1);

    const missingPlace = eventFeatures(
      [{ itemId: 'i2', start: 's', placeId: 'not-hydrated', hasLocationLabel: true }],
      places,
    );
    expect(missingPlace.unmappableCount).toBe(0);
    expect(missingPlace.features.features).toEqual([]);
  });

  // The lookup resolves a place row even when nothing ever geocoded it.
  it('skips a place that has no coordinates', () => {
    const { features } = eventFeatures([{ itemId: 'i1', start: 's', placeId: 'ungeocoded' }], places);
    expect(features.features).toEqual([]);
  });

  it('falls back to the place name when the item has no title', () => {
    const { features } = eventFeatures([{ itemId: 'i1', start: 's', placeId: 'home' }], places);
    expect(props(features).title).toBe('Home');
    expect(props(features).calendarId).toBeNull();
  });
});

describe('contactFeatures', () => {
  const at = (placeId: string, name: string, extra: Record<string, unknown> = {}) => ({
    contactId: name, displayName: name, placeId, addressType: 'Home', ...extra,
  });

  it('merges co-located contacts into one household pin', () => {
    const { features } = contactFeatures([at('home', 'Astrid'), at('home', 'Erik')], places);
    expect(features.features).toHaveLength(1);
    expect(props(features).contactIds).toEqual(['Astrid', 'Erik']);
    expect(props(features).label).toBe('Astrid, Erik · Home');
  });

  it('splits former residencies out of the active pins', () => {
    const moved = at('work', 'Ada', { movedIn: { year: 2019 }, movedOut: { year: 2021 } });
    const { features, former } = contactFeatures([at('home', 'Ada'), moved], places);
    expect(features.features).toHaveLength(1);
    expect(props(features).placeId).toBe('home');
    expect(former.features).toHaveLength(1);
    expect(props(former).status).toBe('former');
    expect(String(props(former).label)).toContain('2019');
  });

  // A pin carries one status, so a place someone left and later returns to cannot merge the two.
  it('keeps former and future at the same place on separate pins', () => {
    const { former } = contactFeatures(
      [
        at('home', 'Ada', { movedIn: { year: 2019 }, movedOut: { year: 2021 } }),
        at('home', 'Ada', { movedIn: { year: 2099 } }),
      ],
      places,
    );
    expect(former.features).toHaveLength(2);
    expect(former.features.map((f) => (f.properties as { status: string }).status).sort())
      .toEqual(['former', 'future']);
  });
});

describe('contactPinLabel', () => {
  it('abbreviates past three names and dedupes the kinds', () => {
    expect(contactPinLabel(['A', 'B', 'C', 'D'], ['Home', 'Home'])).toBe('A, B, +2 · Home');
  });

  it('omits the separator when no address type is known', () => {
    expect(contactPinLabel(['A'], [])).toBe('A');
  });
});

describe('visitFeatures', () => {
  it('rounds a dwell to whole minutes and never shows zero', () => {
    const fc = visitFeatures([
      { id: 'v1', lat: 59, lon: 18, arriveTs: '2026-01-01T10:00:00Z', departTs: '2026-01-01T10:00:20Z' },
    ]);
    expect(props(fc).durationMin).toBe(1);
    expect(props(fc).radiusM).toBeNull();
  });
});

describe('trackFeatures', () => {
  it('drops segments that cannot form a line and labels the activity', () => {
    const fc = trackFeatures(
      [
        { lat: 59, lon: 18, ts: '2026-01-01T10:00:00Z', activity: 'Walking' },
        { lat: 59.1, lon: 18.1, ts: '2026-01-01T10:01:00Z', activity: 'Walking' },
        // A gap past the threshold starts a new segment, and a lone point is not a line.
        { lat: 59.5, lon: 18.5, ts: '2026-01-01T12:00:00Z', activity: null },
      ],
      600,
    );
    expect(fc.features).toHaveLength(1);
    expect(props(fc).activity).toBe('Walking');
  });
});

describe('hotspotFeatures', () => {
  it('keeps the anchor and weight the layer sizes and labels by', () => {
    const fc = hotspotFeatures([
      { id: 'cell:58.000,14.000', latitude: 58, longitude: 14, activeDays: 12, eventCount: 0, photoCount: 80, firstDay: '2025-06-01', lastDay: '2026-07-04' },
    ]);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [14, 58] });
    expect(props(fc)).toMatchObject({ layer: 'hotspot', hotspotId: 'cell:58.000,14.000', placeId: null, label: null, activeDays: 12 });
  });
});

describe('hotspotStats', () => {
  it('always states the days and leaves out zero counts', () => {
    expect(hotspotStats({ activeDays: 1, eventCount: 1, photoCount: 0 })).toBe('1 day · 1 event');
    expect(hotspotStats({ activeDays: 12, eventCount: 0, photoCount: 80 })).toBe('12 days · 80 photos');
  });
});

describe('savedPlaceFeatures', () => {
  it('drops saved places the gazetteer never located', () => {
    const fc = savedPlaceFeatures([
      { id: 's1', label: 'Cabin', isFavorite: true, latitude: 59, longitude: 18 },
      { id: 's2', label: 'Unlocated', isFavorite: false, latitude: null, longitude: null },
    ]);
    expect(fc.features).toHaveLength(1);
    expect(props(fc).label).toBe('Cabin');
  });
});

describe('photoFeatures', () => {
  it('keeps a cell\'s count and extent, and a photo\'s id', () => {
    const fc = photoFeatures([
      { geometry: { coordinates: [16.41, 59.0] }, properties: { count: 1234, thumbUrl: 't', bounds: [16.4, 58.9, 16.5, 59.1] } },
      { geometry: { coordinates: [18.07, 59.33] }, properties: { count: 1, id: 'p1', kind: 'Photo', takenAt: '2016-06-01T12:00:00Z' } },
    ]);
    expect(props(fc, 0)).toMatchObject({ layer: 'photo', count: 1234, countLabel: '1.2k', photoId: null, bounds: [16.4, 58.9, 16.5, 59.1] });
    expect(props(fc, 1)).toMatchObject({ count: 1, countLabel: '1', photoId: 'p1', kind: 'Photo', bounds: null });
  });
});

describe('abbreviateCount', () => {
  it('matches MapLibre\'s point_count_abbreviated', () => {
    expect([31, 999, 1000, 1250, 9_960, 10_000, 24_400].map(abbreviateCount))
      .toEqual(['31', '999', '1k', '1.3k', '10k', '10k', '24k']);
  });
});

describe('photoCellBounds', () => {
  it('grows a single spot to the minimum span around it', () => {
    const [w, s, e, n] = photoCellBounds([16.4106, 58.9964, 16.4106, 58.9964]);
    expect(e - w).toBeCloseTo(0.001, 9);
    expect(n - s).toBeCloseTo(0.001, 9);
    expect((w + e) / 2).toBeCloseTo(16.4106, 9);
  });

  it('leaves an extent that is already wide enough alone', () => {
    expect(photoCellBounds([16, 58, 17, 59])).toEqual([16, 58, 17, 59]);
  });
});
