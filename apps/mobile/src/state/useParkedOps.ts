import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { engine } from '../sync/engine';
import { useSyncStatus } from './useSyncStatus';

/** Ops the engine gave up on, refetched whenever the parked count moves. */
export function useParkedOps() {
  const parked = useSyncStatus().parked;
  return useQuery(mirrorQuery(['outbox', parked], () => engine.parked()));
}
