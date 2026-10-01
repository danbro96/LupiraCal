import { describe, expect, it } from 'vitest';
import { describeHit, hitActions } from './mapHitLabels';
import type { MapHit } from './mapHits';

const point = { lon: 18, lat: 59 };

describe('describeHit', () => {
  it('says where a resident lives, and when a former one did', () => {
    const now: MapHit = { kind: 'contact', key: 'a', point, contactId: 'anna', name: 'Anna', placeName: 'Storgatan 1', addressType: 'Home', residency: 'active', period: null };
    const then: MapHit = { ...now, key: 'b', residency: 'former', period: '2010–2015' };
    expect(describeHit(now)).toEqual({ title: 'Anna', detail: ['Home · Storgatan 1'] });
    expect(describeHit(then).detail).toEqual(['Home · Storgatan 1', 'lived here 2010–2015']);
  });

  it('falls back to readable titles', () => {
    expect(describeHit({ kind: 'event', key: 'e', point, itemId: 'i', title: null, start: null, color: null }).title).toBe('(untitled)');
    expect(describeHit({ kind: 'photoCell', key: 'c', point, count: 12, bounds: [0, 0, 1, 1] }).title).toBe('12 photos');
  });
});

describe('hitActions', () => {
  const saved: MapHit = { kind: 'saved', key: 's', point, label: 'Gym', placeId: 'pl' };

  it('offers the full screen each kind has', () => {
    expect(hitActions({ kind: 'photo', key: 'p', point, photoId: 'p', takenAt: '2026-09-01T10:00:00Z', placeLabel: null, thumbUrl: null }).map((a) => a.action))
      .toEqual(['open', 'day']);
  });

  it('opens a place only where the app has a place screen', () => {
    expect(hitActions(saved)).toEqual([]);
    expect(hitActions(saved, { placeScreen: true })).toEqual([{ action: 'place', label: 'Open place' }]);
  });
});
