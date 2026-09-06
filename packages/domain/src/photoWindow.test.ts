import { describe, expect, it } from 'vitest';
import { eventPhotoWindow } from './photoWindow';

describe('eventPhotoWindow', () => {
  it('pads a timed event on both ends', () => {
    const w = eventPhotoWindow({ startsAt: '2026-08-20T10:00:00Z', endsAt: '2026-08-20T12:00:00Z' })!;
    expect(w.fromIso).toBe('2026-08-20T09:45:00.000Z');
    expect(w.toIso).toBe('2026-08-20T12:15:00.000Z');
  });

  it('gives an event with no end an hour', () => {
    const w = eventPhotoWindow({ startsAt: '2026-08-20T10:00:00Z' })!;
    expect(w.toIso).toBe('2026-08-20T11:15:00.000Z');
  });

  it('ignores an end that precedes the start', () => {
    const w = eventPhotoWindow({ startsAt: '2026-08-20T10:00:00Z', endsAt: '2026-08-19T10:00:00Z' })!;
    expect(w.toIso).toBe('2026-08-20T11:15:00.000Z');
  });

  it('covers whole local days for an all-day event, end inclusive', () => {
    const w = eventPhotoWindow({ isAllDay: true, startDate: '2026-08-20', endDate: '2026-08-21' })!;
    expect(w.fromIso).toBe(new Date(2026, 7, 20).toISOString());
    expect(w.toIso).toBe(new Date(2026, 7, 22).toISOString());
  });

  it('treats a single all-day date as one day', () => {
    const w = eventPhotoWindow({ isAllDay: true, startDate: '2026-08-20' })!;
    expect(w.toIso).toBe(new Date(2026, 7, 21).toISOString());
  });

  it('is null without a start', () => {
    expect(eventPhotoWindow({})).toBeNull();
    expect(eventPhotoWindow({ isAllDay: true })).toBeNull();
    expect(eventPhotoWindow({ startsAt: 'not a date' })).toBeNull();
  });
});
