import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { createItemRelationsBatch, deleteItemRelationsBatch, listRelationEdges, searchItems } from '@lupira/cal-api/fetch/cal';
import { listPhotos, lookupPhotos } from '@lupira/cal-api/fetch/photo';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { PHOTO_LINK, photoEventLinks, THUMB_SAFE_STALE_MS, unlinkedPhotoIds } from '@lupira/cal-domain/photoFormat';
import { captureWindow, EVENT_CANDIDATE_LIMIT, eventPhotoWindow, PHOTO_SUGGEST_LIMIT, type PhotoWindowSource } from '@lupira/cal-domain/photoWindow';
import { displayTitle } from '@lupira/cal-domain/itemLabels';
import { PHOTO_SEARCH } from '@lupira/cal-domain/photoTimeline';
import { getDb } from '../data/db/expoDb';
import { loadItem } from '../data/mirror';
import { invalidatePhotos } from '../sync/reactivity';
import { useSyncStatus } from '../sync/syncStatus';

/** Every photo↔event edge the caller can see, in one call rather than a request per tile. */
function usePhotoEventEdges() {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['photos', 'event-links'],
    enabled: reachable,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await listRelationEdges({ toKind: PHOTO_LINK.toKind });
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
export function useEventPhotoQuery(itemId: string) {
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

  return {
    data: query.data,
    isLoading: edges.isLoading || query.isLoading,
    isRefetching: edges.isRefetching || query.isRefetching,
    error: edges.error ?? query.error,
    refetch: async () => { await edges.refetch(); await query.refetch(); },
  };
}

export function useEventPhotos(itemId: string): PhotoListItemDto[] {
  return useEventPhotoQuery(itemId).data ?? [];
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
      const r = await listPhotos({ from: window!.fromIso, to: window!.toIso, limit: PHOTO_SUGGEST_LIMIT });
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

  return itemIds.map((id, i) => ({ id, title: displayTitle(results[i]?.data?.doc.title) }));
}

/** Events around the photos' capture times — offered as link candidates, never linked automatically: a
 *  photo taken during a 9-to-5 "work" block is not of it. */
export function useLinkCandidates(takenAts: readonly string[], enabled: boolean) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const window = captureWindow(takenAts);
  return useQuery({
    queryKey: ['photos', 'link-candidates', window?.fromIso, window?.toIso],
    enabled: enabled && reachable && window !== null,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await searchItems({ from: window!.fromIso, to: window!.toIso, take: EVENT_CANDIDATE_LIMIT });
      if (r.status !== 200) throw new Error(`item search ${r.status}`);
      return r.data;
    },
  });
}

/** Links the photos not already linked to the event, in one call. `linked` is what an Undo unlinks. */
export async function linkPhotosToEvent(
  itemId: string, photoIds: readonly string[], links: ReadonlyMap<string, string[]>,
): Promise<{ linked: string[]; ok: boolean }> {
  const pending = unlinkedPhotoIds(photoIds, links, itemId);
  if (pending.length === 0) return { linked: [], ok: true };
  const r = await createItemRelationsBatch(itemId, { ...PHOTO_LINK, toRefs: pending }).catch(() => null);
  invalidatePhotos();
  return r?.status === 200 ? { linked: pending, ok: true } : { linked: [], ok: false };
}

export async function unlinkPhotosFromEvent(itemId: string, photoIds: readonly string[]): Promise<boolean> {
  const r = await deleteItemRelationsBatch(itemId, { ...PHOTO_LINK, toRefs: [...photoIds] }).catch(() => null);
  invalidatePhotos();
  return r?.status === 204;
}

/** Events by name, newest first — a photo search usually means a past event. */
export function useEventSearch(query: string) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const term = query.trim();
  return useQuery({
    queryKey: ['photos', 'event-search', term],
    enabled: reachable && term.length >= PHOTO_SEARCH.minQuery,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await searchItems({ query: term, take: PHOTO_SEARCH.events, desc: true });
      if (r.status !== 200) throw new Error(`item search ${r.status}`);
      return r.data;
    },
  });
}
