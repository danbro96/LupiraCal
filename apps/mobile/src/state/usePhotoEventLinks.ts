import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { listRelationEdges, searchItems } from '@lupira/cal-api/fetch/cal';
import { listPhotos, lookupPhotos } from '@lupira/cal-api/fetch/photo';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { photoEventLinks } from '@lupira/cal-domain/photoFormat';
import { eventPhotoWindow, type PhotoWindowSource } from '@lupira/cal-domain/photoWindow';
import { getDb } from '../data/db/expoDb';
import { loadItem } from '../data/mirror';
import { useSyncStatus } from '../sync/syncStatus';
import { THUMB_SAFE_STALE_MS } from './usePhotoLibrary';

/** Every photo↔event edge the caller can see, in one call rather than a request per tile. */
function usePhotoEventEdges() {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['photos', 'event-links'],
    enabled: reachable,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await listRelationEdges({ toKind: 'photo' });
      if (r.status !== 200) throw new Error(`relation edges ${r.status}`);
      return r.data;
    },
  });
}

/** photoId → linked calendar item ids. */
export function usePhotoEventLinks(): Map<string, string[]> {
  const query = usePhotoEventEdges();
  return useMemo(() => photoEventLinks(query.data ?? []), [query.data]);
}

/** The photos linked to one calendar item, hydrated in a single batch lookup. */
export function useEventPhotos(itemId: string): PhotoListItemDto[] {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const edges = usePhotoEventEdges();
  const ids = useMemo(
    () => (edges.data ?? []).filter((e) => e.fromId === itemId).map((e) => e.toRef),
    [edges.data, itemId],
  );

  const query = useQuery({
    queryKey: ['photos', 'lookup', ids],
    enabled: reachable && ids.length > 0,
    staleTime: THUMB_SAFE_STALE_MS,
    retry: 1,
    queryFn: async () => {
      const r = await lookupPhotos({ ids });
      if (r.status !== 200) throw new Error(`photo lookup ${r.status}`);
      return r.data.items;
    },
  });

  return query.data ?? [];
}

/** Photos taken while an event was happening. Candidates only: a photo taken during a 9-to-5 "work"
 *  block is not of it, so nothing is linked until the user says so. */
export function useSuggestedPhotos(item: PhotoWindowSource, exclude: readonly string[], enabled: boolean) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const window = useMemo(() => eventPhotoWindow(item), [item]);

  const query = useQuery({
    queryKey: ['photos', 'suggestions', window?.fromIso, window?.toIso],
    enabled: enabled && reachable && window !== null,
    staleTime: THUMB_SAFE_STALE_MS,
    retry: 1,
    queryFn: async () => {
      const r = await listPhotos({ from: window!.fromIso, to: window!.toIso, limit: 24 });
      if (r.status !== 200) throw new Error(`photos ${r.status}`);
      return r.data.items;
    },
  });

  const items = useMemo(
    () => (query.data ?? []).filter((p) => !exclude.includes(p.id)),
    [query.data, exclude],
  );
  return { items, isLoading: query.isLoading, hasWindow: window !== null };
}

export type LinkedEvent = { id: string; title: string };

/** Titles for a photo's linked events, read from the mirror so they survive offline. Keys stay on the
 *  ['items', id] contract sync already invalidates. */
export function useLinkedEvents(itemIds: string[]): LinkedEvent[] {
  const results = useQueries({
    queries: itemIds.map((id) => ({
      queryKey: ['items', id] as const,
      queryFn: async () => loadItem(await getDb(), id),
    })),
  });

  return itemIds.map((id, i) => ({ id, title: results[i]?.data?.doc.title ?? 'Untitled event' }));
}

/** Events overlapping a capture time — offered as link candidates, never linked automatically: a photo
 *  taken during a 9-to-5 "work" block is not of it. */
export function useLinkCandidates(takenAt: string, enabled: boolean) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['photos', 'link-candidates', takenAt],
    enabled: enabled && reachable,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const t = new Date(takenAt).getTime();
      const r = await searchItems({
        from: new Date(t - 3600_000).toISOString(),
        to: new Date(t + 3600_000).toISOString(),
        take: 25,
      });
      if (r.status !== 200) throw new Error(`item search ${r.status}`);
      return r.data;
    },
  });
}
