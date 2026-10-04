import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet } from 'react-native';
import { Divider, List, Switch, Text } from 'react-native-paper';
import { isCalendarShown } from '@lupira/cal-domain/calendars';
import { fmtDateTime } from '@danbro96/lupira-domain-core/time';
import { APP_VERSION } from '../../config';
import { UPDATE_LABEL } from '@danbro96/lupira-expo-diagnostics/buildInfo';
import { useAuth } from '../../state/auth-store';
import { useBridge } from '../../state/bridge-store';
import { useLocationTracking } from '../../state/location-tracking-store';
import { usePhotoBackup } from '../../state/photo-backup-store';
import { usePrefs } from '../../state/prefs-store';
import { useCalendars } from '../../state/useContainers';
import { useTrackingStatus } from '../../sync/locationTrackingStatus';
import { usePhotoBackupStatus } from '../../sync/photoBackupStatus';
import { runSync } from '../../sync/sync';
import { useSyncStatus } from '../../sync/syncStatus';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { IconButton } from '@danbro96/lupira-expo-paper/components/IconButton';
import { ICONS } from '../icons';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors } from '../theme';

const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' · ');

/** An index, not a form: one row per area with its state in the description, each opening its own screen —
 *  the sibling apps' pattern. Something that needs you (a failed upload, a missing permission) shows here in
 *  the warning colour, so nothing has to be opened to find it. Developer tooling stays behind the debug switch. */
export function SettingsScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { authMode, user, token } = useAuth();
  const prefs = usePrefs();
  const { data: calendars } = useCalendars();
  const bridge = useBridge();
  const photos = usePhotoBackup();
  const photoStatus = usePhotoBackupStatus();
  const tracking = useLocationTracking();
  const trackStatus = useTrackingStatus();
  const { syncing, pending, parked, lastSyncAt } = useSyncStatus();

  const chevron = () => <List.Icon icon={ICONS.chevronRight} />;
  const icon = (name: string) => (p: { color: string; style?: object }) => <List.Icon {...p} icon={name} />;
  const attention = { color: c.warning };

  const hidden = (calendars ?? []).filter((cal) => cal.class !== 'System' && !isCalendarShown(cal, prefs.calendarChoices)).length;
  const calendar = join(
    hidden > 0 && `${hidden} hidden`,
    prefs.showTaskDeadlines ? 'Deadlines on' : 'Deadlines off',
    `${prefs.allDayRows === 'all' ? 'All' : prefs.allDayRows} all-day row${prefs.allDayRows === '1' ? '' : 's'}`,
  );
  const photoAttention = photos.settings.enabled && photoStatus.parked > 0;
  const photo = !photos.settings.enabled ? 'Off' : join(
    'On',
    photos.settings.wifiOnly && 'Wi-Fi only',
    photoStatus.pending > 0 ? `${photoStatus.pending} waiting` : `${photoStatus.done} backed up`,
    photoStatus.parked > 0 && `${photoStatus.parked} failed`,
  );
  const locationAttention = tracking.settings.enabled && (!tracking.backgroundGranted || !!trackStatus.lastError);
  const location = !tracking.settings.enabled ? 'Off' : join(
    tracking.settings.paused || trackStatus.serverPaused ? 'Paused' : 'Recording',
    trackStatus.queued > 0 && `${trackStatus.queued} waiting`,
    !tracking.backgroundGranted && 'only while the app is open',
    trackStatus.lastError && 'upload failing',
  );
  const androidAttention = !bridge.permissionsOk || (bridge.enabled && bridge.status?.accountPresent === false);
  const android = !bridge.enabled ? 'Off' : join(
    bridge.status?.accountPresent === false ? 'Needs repair' : 'On',
    !bridge.permissionsOk && 'permissions missing',
  );
  const issues = pending + parked;
  const sync = join(
    syncing ? 'Syncing…' : lastSyncAt ? `Synced ${fmtDateTime(new Date(lastSyncAt))}` : 'Not synced yet',
    issues > 0 && `${issues} waiting`,
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <List.Item
        title={authMode === 'dev' ? 'Dev auto-auth' : user?.name ?? user?.sub ?? 'Signed out'}
        description={authMode === 'dev' ? 'No sign-in' : user?.name ? user.sub : undefined}
        left={icon(ICONS.account)}
        right={() => (token !== null
          ? <Button title="Sign out" variant="text" onPress={() => void useAuth.getState().clearSession()} />
          : null)}
      />
      <Divider />
      <List.Item
        title="Calendar"
        description={calendar}
        left={icon(ICONS.calendar)}
        right={chevron}
        onPress={() => navigation.navigate('CalendarSettings')}
      />
      <List.Item
        title="Photo backup"
        description={photo}
        descriptionStyle={photoAttention ? attention : undefined}
        left={icon(ICONS.photos)}
        right={chevron}
        onPress={() => navigation.navigate('PhotoSettings')}
      />
      <List.Item
        title="Location"
        description={location}
        descriptionStyle={locationAttention ? attention : undefined}
        left={icon(ICONS.place)}
        right={chevron}
        onPress={() => navigation.navigate('LocationSettings')}
      />
      <List.Item
        title="Android integration"
        description={android}
        descriptionStyle={androidAttention ? attention : undefined}
        left={icon(ICONS.phone)}
        right={chevron}
        onPress={() => navigation.navigate('AndroidSettings')}
      />
      <List.Item
        title="Sync"
        description={sync}
        descriptionStyle={parked > 0 ? attention : undefined}
        left={icon(ICONS.sync)}
        right={() => (
          <IconButton name={ICONS.sync} onPress={() => void runSync()} accessibilityLabel="Sync now" />
        )}
        onPress={() => navigation.navigate('SyncIssues')}
      />
      <Divider />
      <List.Item
        title="Enable debug"
        description="Developer tools and the on-device log"
        left={icon(ICONS.tools)}
        right={() => (
          <Switch
            value={prefs.debugEnabled}
            onValueChange={(v) => void usePrefs.getState().setDebugEnabled(v)}
            accessibilityLabel="Enable debug"
          />
        )}
      />
      {prefs.debugEnabled && (
        <List.Item title="Developer options" left={icon(ICONS.tune)} right={chevron} onPress={() => navigation.navigate('Developer')} />
      )}
      <Text style={[styles.version, { color: c.textSubtle }]}>Lupira Calendar {APP_VERSION} · {UPDATE_LABEL}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.sm },
  version: { fontSize: 12, textAlign: 'center', paddingVertical: spacing.lg },
});
