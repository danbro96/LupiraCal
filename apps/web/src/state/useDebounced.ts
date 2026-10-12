import { useEffect, useState } from 'react';

/** `value` once it has held still for `ms`; pass a primitive so an equal value doesn't restart the wait. */
export function useDebounced<T extends string | number | boolean | null>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
