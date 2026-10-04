import { ymd } from '@danbro96/lupira-domain-core/time';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getDb } from '../data/db/expoDb';
import { searchItems, type ItemSearchRow } from '../data/mirror';
import { useCalendarFilter } from './useContainers';

/** Mirror search, keyed under ['items'] so a sync that touches items refetches it. */
export function useItemSearch(query: string) {
  const filter = useCalendarFilter();
  const today = ymd(new Date());
  return useQuery<ItemSearchRow[]>({
    queryKey: ['items', 'search', query, today, filter],
    queryFn: async () => searchItems(await getDb(), query, today, filter!),
    enabled: query.length > 0 && filter !== null,
    placeholderData: keepPreviousData,
  });
}
