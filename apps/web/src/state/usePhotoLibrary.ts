import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getListPhotosQueryKey, listPhotos, lookupPhotos } from '@lupira/cal-api/query/photo';
import {
  type DayGroup,
  groupByDay as groupDays,
  photoEventLinks,
} from '@lupira/cal-domain/photoFormat';
import type { ListPhotosParams, PhotoListItemDto } from '@lupira/cal-api/models';
import { getListRelationEdgesQueryKey, listRelationEdges } from '@lupira/cal-api/query/cal';
import { addDays, parseYmd, startOfDay } from '@lupira/cal-domain/time';
import { eventPhotoWindow, type PhotoWindowSource } from '@lupira/cal-domain/photoWindow';

/** The gallery's read model. Filters live in URL params so a view is linkable and survives a reload,
 *  exactly as useItemSearch does it. */

export const PHOTO_PAGE_SIZE = 120;

/** Well inside the 24 h presigned-thumbnail expiry — a longer cache would serve dead URLs. */
const THUMB_SAFE_STALE_MS = 15 * 60_000;

export type PhotoFilters = {
  sort: 'TakenAtDesc' | 'TakenAtAsc';
  kind: string;
  located: string;
  place: string;
  status: string;
  event: string;
  /** Local day bounds, 'yyyy-MM-dd' — the same vocabulary the map's range uses. */
  from: string;
  to: string;
};

export function usePhotoFilters(): PhotoFilters {
  const [params] = useSearchParams();
  const sort = params.get('sort') === 'TakenAtAsc' ? 'TakenAtAsc' : 'TakenAtDesc';
  return {
    sort,
    kind: params.get('kind') ?? '',
    located: params.get('located') ?? '',
    place: params.get('place') ?? '',
    status: params.get('status') ?? '',
    event: params.get('event') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
}

export function usePhotoLibrary(filters: PhotoFilters) {
  const params: ListPhotosParams = {
    sort: filters.sort,
    kind: (filters.kind || undefined) as ListPhotosParams['kind'],
    status: (filters.status || undefined) as ListPhotosParams['status'],
    located: filters.located === '' ? undefined : filters.located === 'true',
    place: filters.place || undefined,
    from: filters.from ? startOfDay(parseYmd(filters.from)).toISOString() : undefined,
    to: filters.to ? addDays(startOfDay(parseYmd(filters.to)), 1).toISOString() : undefined,
    limit: PHOTO_PAGE_SIZE,
  };

  const query = useInfiniteQuery({
    queryKey: [...getListPhotosQueryKey(params), 'infinite'],
    queryFn: ({ pageParam, signal }) => listPhotos({ ...params, cursor: pageParam }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: THUMB_SAFE_STALE_MS,
  });

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  return {
    items,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

/** photoId → the calendar items it's linked to, from one call. Powers the "linked" badge, the event
 *  filter, and the viewer's event list without a request per tile. */
export function usePhotoEventLinks() {
  const query = useQuery({
    queryKey: getListRelationEdgesQueryKey({ toKind: 'photo' }),
    queryFn: ({ signal }) => listRelationEdges({ toKind: 'photo' }, { signal }),
    staleTime: 5 * 60_000,
  });

  return useMemo(() => photoEventLinks(query.data ?? []), [query.data]);
}

export type PhotoDay = DayGroup<PhotoListItemDto>;

export function groupByDay(items: PhotoListItemDto[]): PhotoDay[] {
  return groupDays(items, (date) => date.toLocaleDateString(undefined, { dateStyle: 'full' }));
}

/** The photos linked to one calendar item, hydrated from the edge map in a single lookup. */
export function useEventPhotos(itemId: string) {
  const links = usePhotoEventLinks();
  const ids = useMemo(
    () => [...links.entries()].filter(([, items]) => items.includes(itemId)).map(([photoId]) => photoId),
    [links, itemId],
  );

  const { data } = useQuery({
    queryKey: ['/photo-api/photos/lookup', ids],
    queryFn: ({ signal }) => lookupPhotos({ ids }, { signal }),
    enabled: ids.length > 0,
    staleTime: THUMB_SAFE_STALE_MS,
  });

  return data?.items ?? [];
}

/** Photos taken while an event was happening. Candidates only: a photo taken during a 9-to-5 "work"
 *  block is not of it, so nothing is linked until the user says so. */
export function useSuggestedPhotos(item: PhotoWindowSource, exclude: readonly string[], enabled: boolean) {
  const window = useMemo(() => eventPhotoWindow(item), [item]);

  const { data, isLoading } = useQuery({
    queryKey: [...getListPhotosQueryKey({ from: window?.fromIso, to: window?.toIso }), 'suggestions'],
    queryFn: ({ signal }) => listPhotos({ from: window!.fromIso, to: window!.toIso, limit: 24 }, { signal }),
    enabled: enabled && window !== null,
    staleTime: THUMB_SAFE_STALE_MS,
  });

  const items = useMemo(
    () => (data?.items ?? []).filter((p) => !exclude.includes(p.id)),
    [data, exclude],
  );
  return { items, isLoading, hasWindow: window !== null };
}
