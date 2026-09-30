import { describe, expect, it } from 'vitest';
import { placeSpanM, zoomForSpan } from './mapZoom';

describe('zoomForSpan', () => {
  it('frames the requested ground across the given pixels', () => {
    // 64 px over a Stockholm block: the old fixed zoom 15 showed ~78 m — one house.
    expect(zoomForSpan(78, 64, 59.33)).toBeCloseTo(15, 1);
    expect(zoomForSpan(400, 64, 59.33)).toBeCloseTo(12.64, 1);
  });

  it('zooms out as the span grows and stays within the map range', () => {
    expect(zoomForSpan(3000, 64, 59.33)).toBeLessThan(zoomForSpan(400, 64, 59.33));
    expect(zoomForSpan(0.01, 64, 59.33)).toBe(19);
    expect(zoomForSpan(1e9, 64, 59.33)).toBe(1);
  });
});

describe('placeSpanM', () => {
  it('shows a house with its block, a venue closer, a park or airport wider', () => {
    expect(placeSpanM({ kind: 'Address', category: 'Home' })).toBe(400);
    expect(placeSpanM({ kind: 'Poi', category: 'Cafe' })).toBe(250);
    expect(placeSpanM({ kind: 'Area', category: 'Park' })).toBe(800);
    expect(placeSpanM({ kind: 'Poi', category: 'Airport' })).toBe(3000);
  });

  it('falls back to the kind, then to an address', () => {
    expect(placeSpanM({ kind: 'Area', category: 'Unknown' })).toBe(3000);
    expect(placeSpanM({ kind: 'Poi', category: 'Other' })).toBe(250);
    expect(placeSpanM(null)).toBe(400);
  });
});
