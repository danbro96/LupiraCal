import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getListPhotosQueryKey, listPhotos, lookupPhotos, useGetPhotoStats } from '@lupira/cal-api/query/photo';
import { groupByDay as groupDays, photoDayLabel, photoEventLinks, THUMB_SAFE_STALE_MS, type DayGroup, PHOTO_LINK } from '@lupira/cal-domain/photoFormat';
import { filterPhotos } from '@lupira/cal-domain/photoFilter';
import type { ListPhotosParams, PhotoListItemDto } from '@lupira/cal-api/models';
import { getListRelationEdgesQueryKey, listRelationEdges, useSearchItems } from '@lupira/cal-api/query/cal';
import { dayEndIso, dayStartIso } from '@lupira/cal-domain/time';
import { captureWindow, EVENT_CANDIDATE_LIMIT, eventPhotoWindow, PHOTO_SUGGEST_LIMIT, type PhotoWindowSource } from '@lupira/cal-domain/photoWindow';

/** The gallery's read model. Filters live in URL params so a view is linkable and survives a reload,
 *  exactly as useItemSearch does it. */

export const PHOTO_PAGE_SIZE = 120;

export type PhotoFilters = {
  sort: 'TakenAtDesc' | 'TakenAtAsc';
  kind: string;
  located: string;
  place: string;
  status: string;
  event: string;
  /** 'true' shows the trash instead of the library. */
  trashed: string;
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
    trashed: params.get('trashed') ?? '',
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
    from: filters.from ? dayStartIso(filters.from) : undefined,
    to: filters.to ? dayEndIso(filters.to) : undefined,
    trashed: filters.trashed === 'true' || undefined,
    limit: PHOTO_PAGE_SIZE,
  };

  const query = useInfiniteQuery({
    queryKey: [...getListPhotosQueryKey(params), 'infinite'],
    queryFn: ({ pageParam, signal }) => listPhotos({ ...params, cursor: pageParam }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: THUMB_SAFE_STALE_MS,
    enabled: !filters.event,
  });

  // The photo API has no notion of events, so an event's set is the link map's ids, fetched whole.
  const event = useEventPhotoQuery(filters.event);
  const { kind, status, located, place, from, to } = params;
  const { sort } = filters;
  const eventItems = useMemo(
    () => filterPhotos(event.items, { sort, kind, status, located, place, fromIso: from, toIso: to }),
    [event.items, sort, kind, status, located, place, from, to],
  );
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  if (filters.event) {
    return {
      items: eventItems,
      isLoading: event.isLoading,
      isFetching: event.isFetching,
      error: event.error,
      hasNextPage: false,
      fetchNextPage: query.fetchNextPage,
      isFetchingNextPage: false,
    };
  }

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

/** Library totals — the month timeline and the failed chip, without paging the library to count. */
export function usePhotoStats() {
  return useGetPhotoStats({ query: { staleTime: 5 * 60_000 } });
}

/** photoId → the calendar items it's linked to, from one call. Powers the tile badge and the viewer's
 *  event list without a request per tile. */
export function usePhotoEventLinks() {
  const query = useQuery({
    queryKey: getListRelationEdgesQueryKey({ toKind: PHOTO_LINK.toKind }),
    queryFn: ({ signal }) => listRelationEdges({ toKind: PHOTO_LINK.toKind }, { signal }),
    staleTime: 5 * 60_000,
  });

  return useMemo(() => photoEventLinks(query.data ?? []), [query.data]);
}

export type PhotoDay = DayGroup<PhotoListItemDto>;

export function groupByDay(items: PhotoListItemDto[]): PhotoDay[] {
  return groupDays(items, photoDayLabel);
}

function useEventPhotoQuery(itemId: string) {
  const edges = useQuery({
    queryKey: getListRelationEdgesQueryKey({ toKind: PHOTO_LINK.toKind }),
    queryFn: ({ signal }) => listRelationEdges({ toKind: PHOTO_LINK.toKind }, { signal }),
    staleTime: 5 * 60_000,
    enabled: !!itemId,
  });
  const ids = useMemo(
    () => (edges.data ?? []).filter((e) => e.fromId === itemId).map((e) => e.toRef),
    [edges.data, itemId],
  );

  const lookup = useQuery({
    queryKey: ['/photo-api/photos/lookup', ids],
    queryFn: ({ signal }) => lookupPhotos({ ids }, { signal }),
    enabled: ids.length > 0,
    staleTime: THUMB_SAFE_STALE_MS,
  });

  return {
    items: lookup.data?.items ?? EMPTY,
    isLoading: edges.isLoading || lookup.isLoading,
    isFetching: edges.isFetching || lookup.isFetching,
    error: edges.error ?? lookup.error,
  };
}

const EMPTY: PhotoListItemDto[] = [];

/** The photos linked to one calendar item, hydrated from the edge map in a single lookup. */
export function useEventPhotos(itemId: string) {
  return useEventPhotoQuery(itemId).items;
}

/** Events around the photos' capture times, offered as link targets. */
export function useLinkCandidates(takenAts: readonly string[], enabled: boolean) {
  const window = useMemo(() => captureWindow(takenAts), [takenAts]);
  return useSearchItems(
    { from: window?.fromIso, to: window?.toIso, take: EVENT_CANDIDATE_LIMIT },
    { query: { enabled: enabled && window !== null } },
  );
}

/** Photos taken while an event was happening. Candidates only: a photo taken during a 9-to-5 "work"
 *  block is not of it, so nothing is linked until the user says so. */
export function useSuggestedPhotos(item: PhotoWindowSource, exclude: readonly string[], enabled: boolean) {
  const window = useMemo(() => eventPhotoWindow(item), [item]);

  const { data, isLoading } = useQuery({
    queryKey: [...getListPhotosQueryKey({ from: window?.fromIso, to: window?.toIso }), 'suggestions'],
    queryFn: ({ signal }) => listPhotos({ from: window!.fromIso, to: window!.toIso, limit: PHOTO_SUGGEST_LIMIT }, { signal }),
    enabled: enabled && window !== null,
    staleTime: THUMB_SAFE_STALE_MS,
  });

  const items = useMemo(
    () => (data?.items ?? []).filter((p) => !exclude.includes(p.id)),
    [data, exclude],
  );
  return { items, isLoading, hasWindow: window !== null };
}
