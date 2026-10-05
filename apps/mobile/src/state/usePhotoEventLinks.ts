import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createItemRelation, listRelationEdges } from '@lupira/cal-api/fetch/cal';
import { listPhotos, lookupPhotos } from '@lupira/cal-api/fetch/photo';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { THUMB_SAFE_STALE_MS } from '@lupira/cal-domain/thumbCache';
import { PHOTO_LINK } from '@danbro96/lupira-domain-photos/photoLinks';
import { eventPhotoWindow, PHOTO_SUGGEST_LIMIT, type PhotoWindowSource } from '@danbro96/lupira-domain-photos/photoWindow';

/** Every photo↔event edge the caller can see, in one call rather than a request per tile. */
function usePhotoEventEdges() {
  return useQuery(onlineQuery(['photos', 'event-links'], () => listRelationEdges({ toKind: PHOTO_LINK.toKind })));
}

/** The photos linked to one calendar item, hydrated in a single batch lookup. */
export function useEventPhotos(itemId: string): PhotoListItemDto[] {
  const edges = usePhotoEventEdges();
  const ids = (edges.data ?? []).filter((e) => e.fromId === itemId).map((e) => e.toRef);

  const query = useQuery({
    ...onlineQuery(['photos', 'lookup', ids], async () => (await lookupPhotos({ ids })).items),
    enabled: ids.length > 0,
    staleTime: THUMB_SAFE_STALE_MS,
  });

  return query.data ?? [];
}

/** Photos taken while an event was happening. Candidates only: a photo taken during a 9-to-5 "work"
 *  block is not of it, so nothing is linked until the user says so. */
export function useSuggestedPhotos(item: PhotoWindowSource, exclude: readonly string[], enabled: boolean) {
  const window = eventPhotoWindow(item);

  const query = useQuery({
    ...onlineQuery(['photos', 'suggestions', window?.fromIso, window?.toIso], async () =>
      (await listPhotos({ from: window!.fromIso, to: window!.toIso, limit: PHOTO_SUGGEST_LIMIT })).items),
    enabled: enabled && window !== null,
    staleTime: THUMB_SAFE_STALE_MS,
  });

  const items = (query.data ?? []).filter((p) => !exclude.includes(p.id));
  return { items, isLoading: query.isLoading, hasWindow: window !== null };
}

export function useLinkPhoto(itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => createItemRelation(itemId, { ...PHOTO_LINK, toRef: photoId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['photos'] }),
  });
}
