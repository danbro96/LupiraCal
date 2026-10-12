import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { itemHierarchy } from '../data/queries/hierarchy';
import { Aggregate } from '../domain/aggregates';
import { readyDb } from '../sync/engine';

export function useItemHierarchy(itemId: string, parentId: string | null) {
  return useQuery(mirrorQuery([Aggregate.item, 'hierarchy', itemId, parentId], async () => itemHierarchy(await readyDb(), itemId, parentId)));
}
