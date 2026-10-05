import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { Aggregate } from '../domain/aggregates';
import type { ItemDoc, ItemGuards } from '../domain/docTypes';
import { engine } from '../sync/engine';

export function useItemState(id: string) {
  return useQuery(mirrorQuery([Aggregate.item, id], () => engine.doc<ItemDoc, ItemGuards>(Aggregate.item, id)));
}
