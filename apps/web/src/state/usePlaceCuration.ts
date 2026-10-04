import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@danbro96/lupira-http/apiError';
import {
  getGetPlaceQueryKey,
  prunePlaces,
  regeocodePlace,
  useFindOrphanPlaces,
  useGetPlaceHistory,
  useSearchPlaces,
} from '@lupira/cal-api/query/geo';
import type { PlaceSource } from '@lupira/cal-api/models';
import { useInvalidatePlaces } from './useInvalidate';

export function useUnlocatedPlaces(filters: { source?: PlaceSource; verified?: boolean }) {
  return useSearchPlaces({ hasCoordinates: false, limit: 200, ...filters });
}

export function useOrphanPlaces() {
  return useFindOrphanPlaces();
}

export function usePlaceHistory(placeId: string | undefined) {
  return useGetPlaceHistory(placeId ?? '', { query: { enabled: !!placeId } });
}

/** Re-geocode one place; force bypasses the frozen geocode cache. Seeds the healed DTO instead of
 *  invalidating so the row can show the new coords inline before any refetch. */
export function useRegeocode(force = true) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => regeocodePlace(id, { force }),
    onSuccess: (place) => queryClient.setQueryData(getGetPlaceQueryKey(place.id), place),
  });
}

export function usePrune() {
  const invalidate = useInvalidatePlaces();
  return useMutation({
    mutationFn: (placeIds: string[]) => prunePlaces({ placeIds }),
    onSuccess: () => invalidate(),
  });
}

/** The /curation endpoints 404 through the tunnel — geo curation is a home-network capability,
 *  not an error. The QueryClient never retries 4xx, so this is stable to branch on. */
export function isLanOnly404(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
