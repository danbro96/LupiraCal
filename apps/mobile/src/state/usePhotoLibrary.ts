import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getPhoto, getPhotoStats, listPhotoPlaces, listPhotos } from '@lupira/cal-api/fetch/photo';
import type { AssetKind, AssetStatus, ListPhotosParams, PhotoListItemDto, PhotoSort } from '@lupira/cal-api/models';
import { filterPhotos } from '@lupira/cal-domain/photoFilter';
import { groupByDay as groupDays, photoDayLabel, THUMB_SAFE_STALE_MS, type DayGroup } from '@lupira/cal-domain/photoFormat';
import { dayEndIso, dayStartIso } from '@lupira/cal-domain/time';
import { PHOTO_SEARCH } from '@lupira/cal-domain/photoTimeline';
import { getDb } from '../data/db/expoDb';
import { loadPhotoSnapshot, savePhotoSnapshot } from '../data/photoSnapshot';
import { useSyncStatus } from '../sync/syncStatus';
import { useEventPhotoQuery } from './usePhotoEventLinks';

/** The gallery's read model. Photos are network-only — the SQLite mirror covers cal and contacts only —
 *  so every hook here gates on `serverReachable` and overrides the mirror-tuned query defaults
 *  (staleTime Infinity / retry false), exactly like useTaskDeadlines. Keys live under their own
 *  ['photos'] root, outside every sync-invalidation prefix. */

export const PHOTO_PAGE_SIZE = 90;

export type PhotoQueryFilters = {
  sort: PhotoSort;
  kind?: AssetKind;
  status?: AssetStatus;
  located?: boolean;
  place?: string;
  /** Local day bounds, 'yyyy-MM-dd'. */
  from?: string;
  to?: string;
  /** A calendar item id — its linked photos, which the photo API itself knows nothing about. */
  event?: string;
  /** The trash instead of the library. */
  trashed?: boolean;
};

export const DEFAULT_PHOTO_FILTERS: PhotoQueryFilters = { sort: 'TakenAtDesc' };

/** The day bounds are local calendar days; the endpoint takes instants. */
function listParams({ from, to, event: _event, ...rest }: PhotoQueryFilters): ListPhotosParams {
  return {
    ...rest,
    from: from ? dayStartIso(from) : undefined,
    to: to ? dayEndIso(to) : undefined,
  };
}

const isUnfiltered = (f: PhotoQueryFilters) =>
  Object.entries(f).every(([key, value]) => (key === 'sort' ? value === 'TakenAtDesc' : value === undefined));

export function usePhotoLibrary(filters: PhotoQueryFilters) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const unfiltered = isUnfiltered(filters);

  const query = useInfiniteQuery({
    queryKey: ['photos', 'list', filters],
    enabled: reachable && !filters.event,
    staleTime: THUMB_SAFE_STALE_MS,
    retry: 1,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const r = await listPhotos({ ...listParams(filters), limit: PHOTO_PAGE_SIZE, cursor: pageParam });
      if (r.status !== 200) throw new Error(`photos ${r.status}`);
      if (unfiltered && pageParam === undefined) await savePhotoSnapshot(await getDb(), r.data.items);
      return r.data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const offline = !reachable || query.isError;
  const snapshot = useQuery({
    queryKey: ['photos', 'snapshot'],
    enabled: unfiltered && offline && !query.data,
    staleTime: 0,
    queryFn: async () => loadPhotoSnapshot(await getDb()),
  });

  const event = useEventPhotoQuery(filters.event ?? '');
  const { from, to } = listParams(filters);
  const eventItems = filterPhotos(event.data ?? [], { ...filters, fromIso: from, toIso: to });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  if (filters.event) {
    return {
      items: eventItems,
      offline: !reachable,
      isLoading: event.isLoading,
      isRefetching: event.isRefetching,
      error: event.error,
      hasNextPage: false,
      fetchNextPage: query.fetchNextPage,
      isFetchingNextPage: false,
      refetch: event.refetch,
    };
  }

  if (offline && !query.data && unfiltered) {
    return {
      items: snapshot.data ?? [],
      offline: true,
      isLoading: snapshot.isLoading,
      isRefetching: false,
      error: null,
      hasNextPage: false,
      fetchNextPage: query.fetchNextPage,
      isFetchingNextPage: false,
      refetch: query.refetch,
    };
  }

  return {
    items,
    offline,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}

export function usePhoto(photoId: string) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['photos', 'detail', photoId],
    enabled: reachable,
    staleTime: THUMB_SAFE_STALE_MS,
    retry: 1,
    queryFn: async () => {
      const r = await getPhoto(photoId);
      if (r.status !== 200) throw new Error(`photo ${r.status}`);
      return r.data;
    },
  });
}

/** Library totals — powers the upload-health chip without paging the whole library to count. */
export function usePhotoStats() {
  const reachable = useSyncStatus((s) => s.serverReachable);
  return useQuery({
    queryKey: ['photos', 'stats'],
    enabled: reachable,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await getPhotoStats();
      if (r.status !== 200) throw new Error(`photo stats ${r.status}`);
      return r.data;
    },
  });
}

export type PhotoDay = DayGroup<PhotoListItemDto>;

export function groupByDay(items: PhotoListItemDto[]): PhotoDay[] {
  return groupDays(items, photoDayLabel);
}

/** Place names in the library matching a search, most photographed first. */
export function usePlaceSuggestions(query: string) {
  const reachable = useSyncStatus((s) => s.serverReachable);
  const term = query.trim();
  return useQuery({
    queryKey: ['photos', 'places', term],
    enabled: reachable && term.length >= PHOTO_SEARCH.minQuery,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const r = await listPhotoPlaces({ q: term, limit: PHOTO_SEARCH.places });
      if (r.status !== 200) throw new Error(`photo places ${r.status}`);
      return r.data;
    },
  });
}
