import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';
import { ProgressBar, Text, useTheme } from 'react-native-paper';
import { bannerState, type BannerKind } from '../../domain/bannerState';
import { PHASE_LABELS } from '../../domain/syncPhase';
import { useSyncStatus } from '../../sync/syncStatus';
import { Glyph } from './Glyph';
import { ICONS } from '../icons';
import type { RootStackParamList } from '../navigation/types';

const ICON_BY_KIND: Record<BannerKind, (typeof ICONS)['sync' | 'cloudOff' | 'alert']> = {
  syncing: ICONS.sync,
  offline: ICONS.cloudOff,
  parked: ICONS.alert,
  error: ICONS.alert,
};

/** Connection/queue state above the content, and nothing at all when there is none to report. A routine
 *  sync is only a thin activity line laid over the top edge, so it never shifts the screen; offline,
 *  parked changes, errors and a bulk sync's count get a one-line strip. Tapping it opens Sync issues. */
export function SyncBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // useTheme, not useColors: the alert tint is MD3's errorContainer pair, which the estate
  // palette has no equivalent for.
  const theme = useTheme();
  const { syncing, serverReachable, pending, parked, lastError, progress } = useSyncStatus();

  const state = bannerState({ syncing, serverReachable, pending, parked, lastError, progress }, PHASE_LABELS);
  if (!state) return null;

  if (state.quiet) {
    return (
      <View pointerEvents="none" style={styles.overlay} accessibilityLabel={state.text}>
        <ProgressBar indeterminate style={styles.bar} />
      </View>
    );
  }

  const alert = state.kind === 'offline' || state.kind === 'parked' || state.kind === 'error';
  const fg = alert ? theme.colors.onErrorContainer : theme.colors.onSurfaceVariant;
  return (
    <Pressable
      style={[styles.strip, { backgroundColor: alert ? theme.colors.errorContainer : theme.colors.surfaceVariant }]}
      onPress={() => navigation.navigate('SyncIssues')}
      accessibilityRole="button"
      accessibilityLiveRegion="polite"
    >
      <Text variant="bodySmall" style={[styles.text, { color: fg }]} numberOfLines={1}>
        <Glyph name={ICON_BY_KIND[state.kind]} size={14} />  {state.text}
      </Text>
      <Text style={{ color: fg }}><Glyph name={ICONS.chevronRight} size={16} /></Text>
      {state.kind === 'syncing' && <ProgressBar indeterminate style={[styles.bar, styles.stripBar]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Above the screen's later siblings (the grids), which would otherwise paint over it.
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  bar: { height: 2 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28, paddingHorizontal: 12, paddingVertical: 4 },
  text: { flex: 1 },
  stripBar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
