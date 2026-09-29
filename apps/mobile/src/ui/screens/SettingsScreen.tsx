import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { List, Switch, Text } from 'react-native-paper';
import { APP_VERSION } from '../../config';
import { useAuth } from '../../state/auth-store';
import { useBridge } from '../../state/bridge-store';
import { toast, toastError } from '../../feedback/toast';
import { useLocationTracking } from '../../state/location-tracking-store';
import { usePhotoBackup } from '../../state/photo-backup-store';
import { usePhotoBackupStatus } from '../../sync/photoBackupStatus';
import { useTrackingStatus } from '../../sync/locationTrackingStatus';
import { runLocationUpload } from '../../sync/locationUploader';
import { ALL_DAY_ROW_OPTIONS, usePrefs } from '../../state/prefs-store';
import { retryParkedPhotos, runPhotoBackup } from '../../sync/photoUploader';
import { runSync } from '../../sync/sync';
import { useSyncStatus } from '../../sync/syncStatus';
import { useConfirm } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { DateField } from '../components/DateField';
import { SegmentedPicker } from '../components/SegmentedPicker';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';

/** User-facing settings only: session, the Android-integration toggle, and the sync surface.
 *  Everything developer-shaped (backend switching, debug log, bridge diagnostics) lives behind
 *  the Developer row. */
export function SettingsScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { authMode, user, token } = useAuth();
  const bridge = useBridge();
  const prefs = usePrefs();
  const debugEnabled = usePrefs((s) => s.debugEnabled);
  const photos = usePhotoBackup();
  const photoStatus = usePhotoBackupStatus();
  const tracking = useLocationTracking();
  const trackStatus = useTrackingStatus();
  const { syncing, pending, parked, lastSyncAt } = useSyncStatus();
  const confirm = useConfirm();

  const togglePhotoBackup = (value: boolean) => {
    void usePhotoBackup.getState().setEnabled(value).then(async (ok) => {
      if (!ok) {
        const open = await confirm({
          title: 'Photo permissions needed',
          message: 'Access to photos and videos — including their location data — is required to back them up. Grant it in the system settings and try again.',
          confirmLabel: 'Open app settings',
        });
        if (open) void Linking.openSettings();
        return;
      }
      if (value) void runPhotoBackup();
    });
  };

  const toggleTracking = (value: boolean) => {
    if (!value) {
      void useLocationTracking.getState().disable();
      return;
    }
    void useLocationTracking.getState().enable('This phone').then(async (outcome) => {
      if (outcome === 'denied') {
        const open = await confirm({
          title: 'Location permission needed',
          message: 'Recording your route needs access to this device\u2019s location. Grant it in the system settings and try again.',
          confirmLabel: 'Open app settings',
        });
        if (open) void Linking.openSettings();
        return;
      }
      if (outcome === 'foreground-only') {
        toast('Recording only while the app is open — choose “Allow all the time” for a gap-free history.');
      }
    });
  };

  const confirmErase = () => {
    void confirm({
      title: 'Erase location history',
      message: 'Deletes every recorded position on the server, plus the visits and trips derived from them. This cannot be undone.',
      confirmLabel: 'Erase',
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      void useLocationTracking.getState().eraseHistory()
        .then(() => toast('Location history erased.'))
        .catch(() => toastError('Could not erase location history.'));
    });
  };

  const toggleBridge = (value: boolean) => {
    if (value) {
      void useBridge.getState().enable().then(async (ok) => {
        if (ok) return;
        const open = await confirm({
          title: 'Permissions needed',
          message: 'Calendar and contacts permissions are required. Grant them in the system settings and try again.',
          confirmLabel: 'Open app settings',
        });
        if (open) void Linking.openSettings();
      });
    } else {
      void confirm({
        title: 'Turn off Android integration',
        message: 'The Lupira calendar and contacts are removed from this phone (they stay in the app and on the server).',
        confirmLabel: 'Turn off',
        destructive: true,
      }).then((ok) => {
        if (ok) void useBridge.getState().disable();
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <List.Subheader>Account</List.Subheader>
      <Text style={[styles.detail, { color: c.textMuted }]}>
        {authMode === 'dev' ? 'Dev auto-auth (no sign-in)' : user ? `Signed in as ${user.sub}` : 'Signed out'}
      </Text>
      {token !== null && (
        <Button title="Sign out" onPress={() => void useAuth.getState().clearSession()} />
      )}

      <List.Subheader>Android integration</List.Subheader>
      <List.Item
        title="Sync with Android calendar & contacts"
        right={() => <Switch value={bridge.enabled} onValueChange={toggleBridge} disabled={!bridge.loaded} />}
      />
      {bridge.enabled && (
        <Text style={[styles.detail, { color: c.textMuted }]}>
          {bridge.status?.accountPresent ? 'Account active' : 'Account missing — toggle off and on to repair'}
          {bridge.status?.lastSyncAt ? ` · last OS sync ${new Date(bridge.status.lastSyncAt).toLocaleString()}` : ''}
        </Text>
      )}
      {!bridge.permissionsOk && (
        <Pressable onPress={() => void Linking.openSettings()}>
          <Text style={[styles.warning, { color: c.warning }]}>Calendar/contacts permissions missing — tap to open app settings</Text>
        </Pressable>
      )}

      <List.Subheader>Calendars</List.Subheader>
      <List.Item
        title="Show system calendars"
        right={() => (
          <Switch
            value={prefs.showSystemCalendars}
            onValueChange={(v) => void usePrefs.getState().setShowSystemCalendars(v)}
            disabled={!prefs.loaded}
          />
        )}
      />
      <Text style={[styles.detail, { color: c.textMuted }]}>Agent-managed calendars (inbox, prompts …) and their events stay hidden unless enabled.</Text>
      <List.Item
        title="Show task deadlines"
        right={() => (
          <Switch
            value={prefs.showTaskDeadlines}
            onValueChange={(v) => void usePrefs.getState().setShowTaskDeadlines(v)}
            disabled={!prefs.loaded}
          />
        )}
      />
      <Text style={[styles.detail, { color: c.textMuted }]}>Deadlines from Lupira Tasks appear on their due day. Needs a connection.</Text>
      <List.Item title="All-day rows in week view" />
      <SegmentedPicker
        options={ALL_DAY_ROW_OPTIONS}
        selected={prefs.allDayRows}
        onSelect={(v) => void usePrefs.getState().setAllDayRows(v)}
        getLabel={(v) => (v === 'all' ? 'All' : v)}
      />
      <Text style={[styles.detail, { color: c.textMuted }]}>The all-day strip is at most this many rows tall; past that, its last row counts what is hidden per day. Tap a count to show them all.</Text>

      <List.Subheader>Photo backup</List.Subheader>
      <List.Item
        title="Back up photos & videos"
        right={() => (
          <Switch value={photos.settings.enabled} onValueChange={togglePhotoBackup} disabled={!photos.loaded} />
        )}
      />
      {photos.settings.enabled && (
        <>
          <List.Item
            title="Only on Wi-Fi"
            right={() => (
              <Switch
                value={photos.settings.wifiOnly}
                onValueChange={(v) => void usePhotoBackup.getState().setWifiOnly(v)}
              />
            )}
          />
          <View style={styles.row}>
            <Text style={[styles.detail, { color: c.textMuted }]}>Back up from</Text>
            <DateField
              value={photos.settings.backupFrom.slice(0, 10)}
              onChange={(day) => day && void usePhotoBackup.getState().setBackupFrom(new Date(`${day}T00:00:00`).toISOString())}
            />
          </View>
          <Text style={[styles.detail, { color: c.textMuted }]}>
            {photoStatus.progress
              ? `Uploading… ${Math.round(photoStatus.progress.fraction * 100)}%`
              : photoStatus.pending > 0
                ? `${photoStatus.pending} waiting to upload`
                : `${photoStatus.done} backed up`}
          </Text>
          {photoStatus.parked > 0 && (
            <Pressable onPress={() => void retryParkedPhotos()}>
              <Text style={[styles.warning, { color: c.warning }]}>{photoStatus.parked} failed — tap to retry</Text>
            </Pressable>
          )}
        </>
      )}
      <Text style={[styles.detail, { color: c.textMuted }]}>
        Originals upload straight to your own storage. Bulk backup runs while the app is open; in the background it catches up slowly.
      </Text>

      <List.Subheader>Location tracking</List.Subheader>
      <List.Item
        title="Record where I go"
        right={() => (
          <Switch value={tracking.settings.enabled} onValueChange={toggleTracking} disabled={!tracking.loaded} />
        )}
      />
      {tracking.settings.enabled && (
        <>
          <List.Item
            title="Pause recording"
            right={() => (
              <Switch
                value={tracking.settings.paused}
                onValueChange={(v) => void useLocationTracking.getState().setPaused(v)}
              />
            )}
          />
          <Text style={[styles.detail, { color: c.textMuted }]}>
            {trackStatus.serverPaused
              ? 'Paused on the server — nothing is being stored.'
              : trackStatus.queued > 0
                ? `${trackStatus.queued} fixes waiting to upload`
                : trackStatus.lastUploadAt
                  ? `Up to date · last upload ${new Date(trackStatus.lastUploadAt).toLocaleTimeString()}`
                  : 'Up to date'}
          </Text>
          {!tracking.backgroundGranted && (
            <Pressable onPress={() => void Linking.openSettings()}>
              <Text style={[styles.warning, { color: c.warning }]}>
                Recording stops when the app closes — tap to choose “Allow all the time”
              </Text>
            </Pressable>
          )}
          {trackStatus.lastError && (
            <Pressable onPress={() => void runLocationUpload()}>
              <Text style={[styles.warning, { color: c.warning }]}>{trackStatus.lastError} — tap to retry</Text>
            </Pressable>
          )}
          <Pressable onPress={confirmErase}>
            <Text style={[styles.warning, { color: c.danger }]}>Erase my location history</Text>
          </Pressable>
        </>
      )}
      <Text style={[styles.detail, { color: c.textMuted }]}>
        Sampling follows how you’re moving — about every 5 minutes when still, every minute walking, every 30 seconds driving.
        Android shows a permanent notification while recording; that’s required, not optional.
      </Text>

      <List.Subheader>Sync</List.Subheader>
      <Text style={[styles.detail, { color: c.textMuted }]}>
        {syncing ? 'Syncing…' : lastSyncAt ? `Last synced ${new Date(lastSyncAt).toLocaleString()}` : 'Not synced yet'}
      </Text>
      <View style={styles.row}>
        <Button title="Sync now" onPress={() => void runSync()} disabled={syncing} />
        <Button
          variant="text"
          title={`Sync issues${pending + parked > 0 ? ` (${pending + parked})` : ''}`}
          onPress={() => navigation.navigate('SyncIssues')}
        />
      </View>

      <List.Subheader>About</List.Subheader>
      <Text style={[styles.detail, { color: c.textMuted }]}>Lupira Calendar {APP_VERSION}</Text>

      <List.Subheader>Developer</List.Subheader>
      <List.Item
        title="Enable debug"
        description="Show the developer tools and the on-device log"
        right={() => (
          <Switch
            value={debugEnabled}
            onValueChange={(v) => void usePrefs.getState().setDebugEnabled(v)}
            accessibilityLabel="Enable debug"
          />
        )}
      />
      {debugEnabled ? (
        <Button variant="text" title="Developer options" onPress={() => navigation.navigate('Developer')} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  detail: { fontSize: 13 },
  warning: { fontSize: 13, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
