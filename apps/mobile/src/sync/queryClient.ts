import { createAppQueryClient } from '@danbro96/lupira-expo-query/queryClient';
import Constants from 'expo-constants';

/** Online-only roots kept across restarts; mirror reads live in SQLite already. */
const ONLINE_ROOTS = ['photos', 'map', 'places', 'participation'];

export const { queryClient, persistOptions } = createAppQueryClient({
  persistRoots: ONLINE_ROOTS,
  buster: Constants.expoConfig?.version ?? '0.0.0',
});
