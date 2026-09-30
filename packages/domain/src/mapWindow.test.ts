import { describe, expect, it } from 'vitest';
import { mapWindow, trackBucketSeconds } from './mapWindow';

const now = new Date('2026-09-30T12:00:00Z');

describe('mapWindow', () => {
  it('reaches back the chosen span and keeps upcoming events', () => {
    const w = mapWindow('month', now);
    expect(w.from?.toISOString()).toBe('2026-08-31T12:00:00.000Z');
    expect(w.eventsToDay > '2027-03-01').toBe(true);
  });

  it('has no lower bound for all, but still gives the location API a start', () => {
    const w = mapWindow('all', now);
    expect(w.from).toBeNull();
    expect(w.eventsFromDay).toBe('0000-01-01');
    expect(w.movementFrom.getUTCFullYear()).toBe(2000);
  });
});

describe('trackBucketSeconds', () => {
  it('keeps a week at the recorder resolution and caps a long span at an hour', () => {
    expect(trackBucketSeconds(new Date(now.getTime() - 7 * 86_400_000), now)).toBe(30);
    expect(trackBucketSeconds(new Date(now.getTime() - 86_400_000), now)).toBe(30);
    expect(trackBucketSeconds(new Date('2000-01-01'), now)).toBe(3600);
  });
});
