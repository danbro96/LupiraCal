import { ymd } from '@danbro96/lupira-domain-core/time';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { contactEvents } from '../data/queries/contactEvents';
import { Aggregate } from '../domain/aggregates';
import { readyDb } from '../sync/engine';

export function useContactEvents(contactId: string) {
  const today = ymd(new Date());
  return useQuery(mirrorQuery([Aggregate.item, 'byContact', contactId, today], async () => contactEvents(await readyDb(), contactId, today)));
}
