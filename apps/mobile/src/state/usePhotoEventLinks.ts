import { useQuery } from '@tanstack/react-query';
import { listRelationEdges } from '@lupira/cal-api/fetch/cal';
import { listPhotos, lookupPhotos } from '@lupira/cal-api/fetch/photo';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { THUMB_SAFE_STALE_MS } from '@lupira/cal-domain/thumbCache';
import { PHOTO_LINK } from '@danbro96/lupira-domain-photos/photoLinks';
import { eventPhotoWindow, PHOTO_SUGGEST_LIMIT, type PhotoWindowSource } from '@danbro96/lupira-domain-photos/photoWindow';
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

/** The photos linked to one calendar item, hydrated in a single batch lookup. */
export function useEventPhotos(itemId: string): PhotoListItemDto[] {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const edges = usePhotoEventEdges();
  const ids = (edges.data ?? []).filter((e) => e.fromId === itemId).map((e) => e.toRef);

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
  const window = eventPhotoWindow(item);

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

  const items = (query.data ?? []).filter((p) => !exclude.includes(p.id));
  return { items, isLoading: query.isLoading, hasWindow: window !== null };
}
