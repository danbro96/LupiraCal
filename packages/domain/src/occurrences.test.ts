import { describe, expect, it } from 'vitest';
import { clampToDay, layoutColumns, packLanes } from './occurrences';

const day = new Date(2026, 6, 7);

describe('clampToDay', () => {
  it('keeps an in-day span', () => {
    const span = clampToDay(new Date(2026, 6, 7, 9), new Date(2026, 6, 7, 10, 30), day);
    expect(span).toEqual({ startMin: 540, endMin: 630 });
  });

  it('clamps a multi-day span to the full day', () => {
    const span = clampToDay(new Date(2026, 6, 6, 22), new Date(2026, 6, 8, 2), day);
    expect(span).toEqual({ startMin: 0, endMin: 1440 });
  });

  it('rejects a non-overlapping span', () => {
    expect(clampToDay(new Date(2026, 6, 8, 9), new Date(2026, 6, 8, 10), day)).toBeNull();
  });

  it('floors zero-length events at 15 minutes', () => {
    const span = clampToDay(new Date(2026, 6, 7, 9), new Date(2026, 6, 7, 9), day);
    expect(span).toEqual({ startMin: 540, endMin: 555 });
  });

  it('treats an event ending at the next midnight as running to end of day', () => {
    const span = clampToDay(new Date(2026, 6, 7, 20), new Date(2026, 6, 8, 0, 0), day);
    expect(span).toEqual({ startMin: 1200, endMin: 1440 });
  });
});

describe('layoutColumns', () => {
  it('stacks disjoint spans in one column', () => {
    const placed = layoutColumns([
      { startMin: 60, endMin: 120, item: 'a' },
      { startMin: 120, endMin: 180, item: 'b' },
    ]);
    expect(placed.map((p) => [p.item, p.col, p.cols])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ]);
  });

  it('splits overlapping spans into columns sharing a cluster width', () => {
    const placed = layoutColumns([
      { startMin: 60, endMin: 180, item: 'a' },
      { startMin: 90, endMin: 150, item: 'b' },
      { startMin: 150, endMin: 210, item: 'c' }, // fits back into b's freed column
    ]);
    const byItem = Object.fromEntries(placed.map((p) => [p.item, p]));
    expect(byItem.a.col).toBe(0);
    expect(byItem.b.col).toBe(1);
    expect(byItem.c.col).toBe(1);
    expect(placed.every((p) => p.cols === 2)).toBe(true);
  });

  it('starts a fresh cluster after a gap', () => {
    const placed = layoutColumns([
      { startMin: 0, endMin: 60, item: 'a' },
      { startMin: 30, endMin: 60, item: 'b' },
      { startMin: 120, endMin: 180, item: 'c' },
    ]);
    const c = placed.find((p) => p.item === 'c')!;
    expect(c.col).toBe(0);
    expect(c.cols).toBe(1);
  });

  it('splits back-to-back short events into columns when minMinutes would overlap them', () => {
    // Two touching 15-min events: without a min they share a column; with a 22.5-min floor they collide.
    const spans = [
      { startMin: 0, endMin: 15, item: 'a' },
      { startMin: 15, endMin: 30, item: 'b' },
    ];
    expect(layoutColumns(spans).every((p) => p.col === 0)).toBe(true);
    const withMin = layoutColumns(spans, 22.5);
    expect(withMin.find((p) => p.item === 'a')!.col).toBe(0);
    expect(withMin.find((p) => p.item === 'b')!.col).toBe(1);
  });
});

describe('packLanes', () => {
  const lanesOf = (bars: { id: string; startCol: number; endCol: number }[]) =>
    Object.fromEntries(packLanes(bars).map((b) => [b.id, b.lane]));

  it('shares a row between bars that do not touch', () => {
    expect(lanesOf([
      { id: 'mon-tue', startCol: 0, endCol: 1 },
      { id: 'wed', startCol: 2, endCol: 2 },
      { id: 'thu-sun', startCol: 3, endCol: 6 },
    ])).toEqual({ 'mon-tue': 0, wed: 0, 'thu-sun': 0 });
  });

  it('stacks overlapping bars, longest first within a start day', () => {
    expect(lanesOf([
      { id: 'mon', startCol: 0, endCol: 0 },
      { id: 'mon-fri', startCol: 0, endCol: 4 },
      { id: 'tue', startCol: 1, endCol: 1 },
      { id: 'sat', startCol: 5, endCol: 5 },
    ])).toEqual({ 'mon-fri': 0, mon: 1, tue: 1, sat: 0 });
  });
});
