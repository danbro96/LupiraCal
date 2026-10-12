import { useOnline } from '@danbro96/lupira-expo-query/online';
import { useState } from 'react';
import { engine } from '../sync/engine';

/** Pull-to-refresh over the engine. The spinner follows the pulled sync's promise, not `phase`: the engine sets
 *  `phase` only after opening the kernel, so the spinner would drop and come back. Background syncs keep to the banner. */
export function usePullToSync() {
  const online = useOnline();
  const [pulled, setPulled] = useState(false);
  const onRefresh = () => {
    setPulled(true);
    void engine.sync().finally(() => setPulled(false));
  };
  return { enabled: online, refreshing: online && pulled, onRefresh };
}
