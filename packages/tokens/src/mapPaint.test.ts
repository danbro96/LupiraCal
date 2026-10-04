import { describe, expect, it } from 'vitest';
import { clusterRadius, hotspotRadius } from './mapPaint';

describe('map mark sizes', () => {
  it('gives a finger bigger cluster targets and a phone smaller halos', () => {
    expect(clusterRadius('touch')).toEqual(['step', ['get', 'point_count'], 14, 10, 18, 50, 24]);
    expect(clusterRadius('pointer', 'count')).toEqual(['step', ['get', 'count'], 12, 10, 16, 50, 22]);
    expect(hotspotRadius('touch')).toEqual(['interpolate', ['linear'], ['sqrt', ['get', 'activeDays']], 1.7, 10, 10, 28]);
  });
});
