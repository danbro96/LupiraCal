// Placement math for the week/day grids: timed lanes and the all-day strip.

export interface DaySpan {
  /** Minutes from local midnight, clamped to [0, 1440]. */
  startMin: number;
  endMin: number;
}

/** Clamp a timed span to one day; null when it doesn't overlap the day. */
export function clampToDay(start: Date, end: Date, day: Date): DaySpan | null {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  if (start >= dayEnd || end <= dayStart) return null;
  const s = start < dayStart ? 0 : start.getHours() * 60 + start.getMinutes();
  const e = end >= dayEnd ? 1440 : end.getHours() * 60 + end.getMinutes();
  return { startMin: s, endMin: Math.max(e, s + 15) }; // floor at 15 min so zero-length events stay clickable
}

export interface Positioned<T> extends DaySpan {
  item: T;
  /** Column index within the overlap cluster, and the cluster's column count. */
  col: number;
  cols: number;
}

/**
 * Assign side-by-side columns to overlapping spans (greedy first-free-column, then each overlap
 * cluster shares its max column count so widths line up). `minMinutes` treats each span as at least
 * that long for collision purposes, so short events rendered at a min height don't visually overlap
 * their neighbours — they get their own column instead.
 */
export function layoutColumns<T>(spans: Array<DaySpan & { item: T }>, minMinutes = 0): Positioned<T>[] {
  const effEnd = (s: DaySpan) => Math.max(s.endMin, s.startMin + minMinutes);
  const sorted = [...spans].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const placed: Positioned<T>[] = [];
  const colEnds: number[] = []; // per column: the effective end of its last span
  let cluster: Positioned<T>[] = [];
  let clusterEnd = -1;

  const closeCluster = () => {
    const cols = Math.max(...cluster.map((p) => p.col), 0) + 1;
    for (const p of cluster) p.cols = cols;
    cluster = [];
    colEnds.length = 0;
  };

  for (const span of sorted) {
    if (cluster.length > 0 && span.startMin >= clusterEnd) closeCluster();
    let col = colEnds.findIndex((end) => end <= span.startMin);
    if (col === -1) col = colEnds.length;
    colEnds[col] = effEnd(span);
    const positioned: Positioned<T> = { ...span, col, cols: 1 };
    cluster.push(positioned);
    placed.push(positioned);
    clusterEnd = Math.max(clusterEnd, effEnd(span));
  }
  if (cluster.length > 0) closeCluster();
  return placed;
}

export interface ColumnRange {
  /** Inclusive day-column indices. */
  startCol: number;
  endCol: number;
}

/** Stack multi-day bars into rows: each bar takes the first row free across its whole range. Sorted by
 *  start then longest first, which is optimal for intervals — no row is added that a reorder could avoid. */
export function packLanes<T extends ColumnRange>(bars: T[]): Array<T & { lane: number }> {
  const sorted = [...bars].sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);
  const laneEnds: number[] = [];
  return sorted.map((bar) => {
    let lane = laneEnds.findIndex((end) => end < bar.startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = bar.endCol;
    return { ...bar, lane };
  });
}
