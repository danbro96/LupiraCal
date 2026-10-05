import type { SyncStatus } from '@danbro96/lupira-sync-engine/status';
import { useSyncExternalStore } from 'react';
import { engine } from '../sync/engine';

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(engine.status.subscribe, engine.status.getSnapshot);
}
