import { useQuery } from '@tanstack/react-query';
import { getListPhotosQueryKey, listPhotos, lookupPhotos } from '@lupira/cal-api/query/photo';
import { THUMB_SAFE_STALE_MS } from '@lupira/cal-domain/thumbCache';
import { PHOTO_LINK } from '@danbro96/lupira-domain-photos/photoLinks';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { getListRelationEdgesQueryKey, listRelationEdges } from '@lupira/cal-api/query/cal';
import { eventPhotoWindow, PHOTO_SUGGEST_LIMIT, type PhotoWindowSource } from '@danbro96/lupira-domain-photos/photoWindow';

const EMPTY: PhotoListItemDto[] = [];

/** The photos linked to one calendar item, hydrated from the edge map in a single lookup. */
export function useEventPhotos(itemId: string) {
  const edges = useQuery({
    queryKey: getListRelationEdgesQueryKey({ toKind: PHOTO_LINK.toKind }),
    queryFn: ({ signal }) => listRelationEdges({ toKind: PHOTO_LINK.toKind }, { signal }),
    staleTime: 5 * 60_000,
    enabled: !!itemId,
  });
  const ids = (edges.data ?? []).filter((e) => e.fromId === itemId).map((e) => e.toRef);

  const lookup = useQuery({
    queryKey: ['/photo-api/photos/lookup', ids],
    queryFn: ({ signal }) => lookupPhotos({ ids }, { signal }),
    enabled: ids.length > 0,
    staleTime: THUMB_SAFE_STALE_MS,
  });

  return lookup.data?.items ?? EMPTY;
}

/** Photos taken while an event was happening. Candidates only: a photo taken during a 9-to-5 "work"
 *  block is not of it, so nothing is linked until the user says so. */
export function useSuggestedPhotos(item: PhotoWindowSource, exclude: readonly string[], enabled: boolean) {
  const window = eventPhotoWindow(item);

  const { data, isLoading } = useQuery({
    queryKey: [...getListPhotosQueryKey({ from: window?.fromIso, to: window?.toIso }), 'suggestions'],
    queryFn: ({ signal }) => listPhotos({ from: window!.fromIso, to: window!.toIso, limit: PHOTO_SUGGEST_LIMIT }, { signal }),
    enabled: enabled && window !== null,
    staleTime: THUMB_SAFE_STALE_MS,
  });

  const items = (data?.items ?? []).filter((p) => !exclude.includes(p.id));
  return { items, isLoading, hasWindow: window !== null };
}
