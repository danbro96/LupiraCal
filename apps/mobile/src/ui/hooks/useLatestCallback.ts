import { useLayoutEffect, useRef } from 'react';

/** A stable function that always calls the latest `fn`, for callbacks handed to gestures and worklets. */
export function useLatestCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return (...args: A) => latest.current(...args);
}
