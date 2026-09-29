import { ymd } from '@lupira/cal-domain/time';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getDb } from '../data/db/expoDb';
import { searchItems, type ItemSearchRow } from '../data/mirror';
import { usePrefs } from './prefs-store';

/** Mirror search, keyed under ['items'] so a sync that touches items refetches it. */
export function useItemSearch(query: string) {
  const includeSystem = usePrefs((p) => p.showSystemCalendars);
  const today = ymd(new Date());
  return useQuery<ItemSearchRow[]>({
    queryKey: ['items', 'search', query, today, includeSystem],
    queryFn: async () => searchItems(await getDb(), query, today, includeSystem),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
  });
}
