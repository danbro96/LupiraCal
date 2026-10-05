import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { useQuery } from '@tanstack/react-query';
import { getParticipationSummary } from '@lupira/cal-api/fetch/cal';

/** Who the caller meets most, for ranking the people picker; it fails open to alphabetical while loading or
 *  offline. */
export function useParticipationSummary(enabled: boolean) {
  return useQuery({ ...onlineQuery(['participation', 'summary'], () => getParticipationSummary()), enabled });
}
