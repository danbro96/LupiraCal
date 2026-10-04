import { describe, expect, it } from 'vitest';
import type { DayGroup } from '@lupira/cal-domain/photoFormat';
import { photoGrid } from './photoGrid';

const day = (key: string, count: number): DayGroup<string> => ({
  key,
  label: key,
  items: Array.from({ length: count }, (_, i) => `${key}#${i}`),
});

describe('photoGrid', () => {
  it('puts a header before each day and chunks its photos into rows of `columns`', () => {
    const a = day('2026-10-04', 7);
    const b = day('2026-10-03', 3);
    const { entries, headerIndices } = photoGrid([a, b], 3);

    expect(entries).toEqual([
      { kind: 'header', day: a },
      { kind: 'row', key: '2026-10-04:0', photos: ['2026-10-04#0', '2026-10-04#1', '2026-10-04#2'] },
      { kind: 'row', key: '2026-10-04:3', photos: ['2026-10-04#3', '2026-10-04#4', '2026-10-04#5'] },
      { kind: 'row', key: '2026-10-04:6', photos: ['2026-10-04#6'] },
      { kind: 'header', day: b },
      { kind: 'row', key: '2026-10-03:0', photos: ['2026-10-03#0', '2026-10-03#1', '2026-10-03#2'] },
    ]);
    expect(headerIndices).toEqual([0, 4]);
  });

  it('keeps row keys stable when a later page appends to the last day', () => {
    const before = photoGrid([day('d', 4)], 3).entries.map((e) => (e.kind === 'row' ? e.key : 'h'));
    const after = photoGrid([day('d', 8)], 3).entries.map((e) => (e.kind === 'row' ? e.key : 'h'));
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('is empty for no days', () => {
    expect(photoGrid([], 3)).toEqual({ entries: [], headerIndices: [] });
  });
});
