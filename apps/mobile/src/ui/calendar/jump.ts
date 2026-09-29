import { useLayoutEffect, useRef } from 'react';

/** A navigation the grids must follow rather than animate: Today, or a date from the picker. `seq`
 *  bumps per jump; `toNow` also brings the current time into view; `day` also selects that day. */
export type CalendarJump = { seq: number; toNow: boolean; day?: string };

/** Runs `apply` once per new jump — not on mount, where the view already starts at the anchor. */
export function useJump(jump: CalendarJump, apply: (jump: CalendarJump) => void) {
  const lastSeq = useRef(jump.seq);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useLayoutEffect(() => {
    if (jump.seq === lastSeq.current) return;
    lastSeq.current = jump.seq;
    applyRef.current(jump);
  }, [jump]);
}
