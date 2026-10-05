import { ymd } from '@danbro96/lupira-domain-core/time';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchItems } from '../data/queries/search';
import { Aggregate } from '../domain/aggregates';
import { readyDb } from '../sync/engine';
import { useCalendarFilter } from './useContainers';

export function useItemSearch(query: string) {
  const filter = useCalendarFilter();
  const today = ymd(new Date());
  return useQuery({
    ...mirrorQuery([Aggregate.item, 'search', query, today, filter], async () => searchItems(await readyDb(), query, today, filter!)),
    enabled: query.length > 0 && filter !== null,
    placeholderData: keepPreviousData,
  });
}
