import type { Feature } from 'geojson';
import { describe, expect, it } from 'vitest';
import { hitsFromFeatures } from './mapHits';

const at = (properties: Record<string, unknown>, lon = 18.07, lat = 59.33): Feature => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties,
});

describe('hitsFromFeatures', () => {
  it('lists everything stacked on one spot, things before statistics', () => {
    const hits = hitsFromFeatures([
      at({ layer: 'hotspot', hotspotId: 'h1', label: 'Home', activeDays: 40, eventCount: 3, photoCount: 9, firstDay: '2025-01-01', lastDay: '2026-09-01' }),
      at({ layer: 'photo', count: 1, photoId: 'p1', takenAt: '2026-09-01T10:00:00Z', placeLabel: 'Home', thumbUrl: 'https://x/t.jpg' }),
      at({ layer: 'event', itemId: 'i1', title: 'Dinner', start: '2026-09-02T17:00:00Z', color: '#0d9488' }),
    ]);
    expect(hits.map((h) => h.kind)).toEqual(['event', 'photo', 'hotspot']);
  });

  it('expands a household pin into its residents, reading stringified arrays', () => {
    const hits = hitsFromFeatures([
      at({ layer: 'contact', placeId: 'pl', placeName: 'Storgatan 1', contactIds: '["anna","erik"]', names: '["Anna","Erik"]', addressTypes: '["Home"]' }),
    ]);
    expect(hits.map((h) => (h.kind === 'contact' ? [h.name, h.addressType] : null))).toEqual([['Anna', 'Home'], ['Erik', null]]);
  });

  it('tells a server photo cell from a photo, and drops clusters and duplicates', () => {
    const hits = hitsFromFeatures([
      at({ layer: 'photo', count: 12, bounds: '[18,59,18.1,59.4]' }),
      at({ cluster: true, point_count: 4 }),
      at({ layer: 'event', itemId: 'i1' }),
      at({ layer: 'event', itemId: 'i1' }),
    ]);
    expect(hits.map((h) => h.kind)).toEqual(['event', 'photoCell']);
    expect(hits[1]).toMatchObject({ count: 12, bounds: [18, 59, 18.1, 59.4] });
  });

  it("reads the history layer's former and future residents with their period, and a device's last fix", () => {
    const hits = hitsFromFeatures([
      at({ layer: 'contact-former', status: 'former', placeId: 'pl', contactIds: ['bo'], names: ['Bo'], periods: ['2010–2015'] }),
      at({ layer: 'current', deviceId: 'phone', ts: '2026-09-30T10:00:00Z', batteryPct: 80 }),
    ]);
    expect(hits[0]).toMatchObject({ kind: 'contact', name: 'Bo', residency: 'former', period: '2010–2015' });
    expect(hits[1]).toMatchObject({ kind: 'currentFix', deviceId: 'phone', batteryPct: 80 });
  });
});
