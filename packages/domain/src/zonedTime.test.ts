import { describe, expect, it } from 'vitest';
import { canonicalTimeZone, fmtZoneOffset, instantToWall, isValidTimeZone, wallToInstant, zoneCity } from './zonedTime';

describe('wallToInstant', () => {
  it('reads a wall clock in the named zone, not the host', () => {
    expect(wallToInstant('2026-07-01', '09:00', 'Europe/Stockholm').toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(wallToInstant('2026-01-15', '09:00', 'Europe/Stockholm').toISOString()).toBe('2026-01-15T08:00:00.000Z');
    expect(wallToInstant('2026-07-01', '09:00', 'Asia/Tokyo').toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(wallToInstant('2026-07-01', '23:30', 'America/New_York').toISOString()).toBe('2026-07-02T03:30:00.000Z');
  });

  it('resolves a spring-forward gap to just past it', () => {
    // Stockholm skips 02:00–03:00 on 2026-03-29.
    expect(wallToInstant('2026-03-29', '02:30', 'Europe/Stockholm').toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('takes the first reading of an ambiguous fall-back hour', () => {
    // 02:30 happens twice on 2026-10-25 — first in CEST (UTC+2).
    expect(wallToInstant('2026-10-25', '02:30', 'Europe/Stockholm').toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });
});

describe('instantToWall', () => {
  it('round-trips with wallToInstant', () => {
    for (const tz of ['Europe/Stockholm', 'Asia/Kolkata', 'America/Los_Angeles', 'UTC']) {
      const iso = wallToInstant('2026-11-02', '18:45', tz).toISOString();
      expect(instantToWall(iso, tz)).toEqual({ day: '2026-11-02', time: '18:45' });
    }
  });

  it('crosses the date line', () => {
    expect(instantToWall('2026-07-01T20:00:00Z', 'Pacific/Auckland')).toEqual({ day: '2026-07-02', time: '08:00' });
  });
});

describe('zone labels', () => {
  it('formats offsets, including half hours and negatives', () => {
    expect(fmtZoneOffset('Europe/Stockholm', new Date('2026-07-01T00:00:00Z'))).toBe('UTC+2');
    expect(fmtZoneOffset('Asia/Kolkata', new Date('2026-07-01T00:00:00Z'))).toBe('UTC+5:30');
    expect(fmtZoneOffset('America/New_York', new Date('2026-01-01T00:00:00Z'))).toBe('UTC−5');
    expect(fmtZoneOffset('UTC')).toBe('UTC');
  });

  it('names the city', () => {
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneCity('UTC')).toBe('UTC');
  });

  it('validates ids', () => {
    expect(isValidTimeZone('Europe/Stockholm')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('canonicalizes typed ids', () => {
    expect(canonicalTimeZone('asia/tokyo')).toBe('Asia/Tokyo');
    expect(canonicalTimeZone('Mars/Olympus')).toBeNull();
  });
});
