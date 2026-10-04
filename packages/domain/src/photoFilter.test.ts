import { describe, expect, it } from 'vitest';
import { filterPhotos, photoEmptyText } from './photoFilter';

const photo = (id: string, takenAt: string, extra: Partial<{ kind: string; status: string; latitude: number | null; placeLabel: string | null }> = {}) =>
  ({ id, takenAt, kind: 'Photo', status: 'Ready', latitude: null, placeLabel: null, ...extra });

describe('filterPhotos', () => {
  const items = [
    photo('a', '2025-07-01T10:00:00Z', { placeLabel: 'Stockholm', latitude: 59.3 }),
    photo('b', '2025-07-03T10:00:00Z', { kind: 'Video' }),
    photo('c', '2025-07-02T10:00:00Z', { status: 'Duplicate' }),
    photo('d', '2025-07-04T10:00:00Z', { status: 'Failed' }),
  ];
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it('sorts newest first and hides duplicates by default', () => {
    expect(ids(filterPhotos(items, { sort: 'TakenAtDesc' }))).toEqual(['d', 'b', 'a']);
  });

  it('sorts oldest first', () => {
    expect(ids(filterPhotos(items, { sort: 'TakenAtAsc' }))).toEqual(['a', 'b', 'd']);
  });

  it('shows duplicates only when asked for by name', () => {
    expect(ids(filterPhotos(items, { sort: 'TakenAtDesc', status: 'Duplicate' }))).toEqual(['c']);
  });

  it('filters by kind, location and place substring', () => {
    expect(ids(filterPhotos(items, { sort: 'TakenAtDesc', kind: 'Video' }))).toEqual(['b']);
    expect(ids(filterPhotos(items, { sort: 'TakenAtDesc', located: true }))).toEqual(['a']);
    expect(ids(filterPhotos(items, { sort: 'TakenAtDesc', located: false }))).toEqual(['d', 'b']);
    expect(ids(filterPhotos(items, { sort: 'TakenAtDesc', place: ' stock ' }))).toEqual(['a']);
  });

  it('keeps both instant bounds inclusive', () => {
    const r = filterPhotos(items, { sort: 'TakenAtAsc', fromIso: '2025-07-01T10:00:00Z', toIso: '2025-07-03T10:00:00Z' });
    expect(ids(r)).toEqual(['a', 'b']);
  });
});

describe('photoEmptyText', () => {
  it('reads an event filter alone as that event, and anything else as filters', () => {
    expect(photoEmptyText({ event: 'e1' })).toBe('No photos linked to this event yet.');
    expect(photoEmptyText({ event: 'e1', kind: 'Video' })).toBe('No photos match these filters.');
    expect(photoEmptyText({ located: false })).toBe('No photos match these filters.');
    expect(photoEmptyText({ trashed: true, event: 'e1' })).toBe('Trash is empty.');
    expect(photoEmptyText({})).toBe('No photos yet.');
  });
});
