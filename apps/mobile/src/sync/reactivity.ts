import { QueryClient } from '@tanstack/react-query';

/** Mirror reactivity: sync and enqueue report which month buckets they touched and only those grid queries
 *  refetch — the fix for the tasks app's global revision counter that reloaded every mounted query on any
 *  write. Query keys: ['occurrences', 'YYYY-MM']. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false },   // the mirror is local — no polling, no network retries
  },
});

export function invalidateMonthKeys(monthKeys: Iterable<string>): void {
  for (const key of new Set(monthKeys))
    void queryClient.invalidateQueries({ queryKey: ['occurrences', key] });
}

export function invalidateContacts(): void {
  void queryClient.invalidateQueries({ queryKey: ['contacts'] });
}

export function invalidateItems(): void {
  void queryClient.invalidateQueries({ queryKey: ['items'] });
}

export function invalidateOutbox(): void {
  void queryClient.invalidateQueries({ queryKey: ['outbox'] });
}

export function invalidateMe(): void {
  void queryClient.invalidateQueries({ queryKey: ['me'] });
}

export function invalidateContainers(): void {
  void queryClient.invalidateQueries({ queryKey: ['containers'] });
}

/** Photos are network-only, so nothing in sync calls this — only the gallery's own writes do. */
export function invalidatePhotos(): void {
  void queryClient.invalidateQueries({ queryKey: ['photos'] });
}
