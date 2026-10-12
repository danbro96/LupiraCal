import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { bannerState } from '@danbro96/lupira-sync-engine/bannerState';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { StatusBanner } from '@danbro96/lupira-expo-paper/components/StatusBanner';
import { AGGREGATE_LABELS } from '../../domain/aggregates';
import { useSyncStatus } from '../../state/useSyncStatus';
import type { RootStackParamList } from '../navigation/types';

/** Connection/queue state above the content; tapping it opens Sync issues. */
export function SyncBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const status = useSyncStatus();
  const online = useOnline();

  return <StatusBanner state={bannerState({ ...status, online }, AGGREGATE_LABELS)} onPress={() => navigation.navigate('SyncIssues')} />;
}
