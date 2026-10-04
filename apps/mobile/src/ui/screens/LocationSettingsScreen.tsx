import { Linking, ScrollView, StyleSheet } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { toast, toastError } from '@danbro96/lupira-expo-feedback/toast';
import { useLocationTracking } from '../../state/location-tracking-store';
import { useTrackingStatus } from '../../sync/locationTrackingStatus';
import { runLocationUpload } from '../../sync/locationUploader';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { SettingsAction, SettingsNote } from '../components/SettingsText';
import { spacing } from '../theme';

export function LocationSettingsScreen() {
  const tracking = useLocationTracking();
  const status = useTrackingStatus();
  const confirm = useConfirm();

  const toggle = (value: boolean) => {
    if (!value) {
      void useLocationTracking.getState().disable();
      return;
    }
    void useLocationTracking.getState().enable('This phone').then(async (outcome) => {
      if (outcome === 'denied') {
        const open = await confirm({
          title: 'Location permission needed',
          message: 'Recording your route needs access to this device’s location. Grant it in the system settings and try again.',
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <List.Item
        title="Record where I go"
        right={() => <Switch value={tracking.settings.enabled} onValueChange={toggle} disabled={!tracking.loaded} />}
      />
      {tracking.settings.enabled && (
        <>
          <List.Item
            title="Pause recording"
            right={() => (
              <Switch value={tracking.settings.paused} onValueChange={(v) => void useLocationTracking.getState().setPaused(v)} />
            )}
          />
          <SettingsNote>
            {status.serverPaused
              ? 'Paused on the server — nothing is being stored.'
              : status.queued > 0
                ? `${status.queued} fixes waiting to upload`
                : status.lastUploadAt
                  ? `Up to date · last upload ${new Date(status.lastUploadAt).toLocaleTimeString()}`
                  : 'Up to date'}
          </SettingsNote>
          {!tracking.backgroundGranted && (
            <SettingsAction onPress={() => void Linking.openSettings()}>
              Recording stops when the app closes — tap to choose “Allow all the time”
            </SettingsAction>
          )}
          {status.lastError && (
            <SettingsAction onPress={() => void runLocationUpload()}>{status.lastError} — tap to retry</SettingsAction>
          )}
          <SettingsAction tone="danger" onPress={confirmErase}>Erase my location history</SettingsAction>
        </>
      )}
      <SettingsNote>
        Sampling follows how you’re moving — about every 5 minutes when still, every minute walking, every 30 seconds
        driving. Android shows a permanent notification while recording; that’s required, not optional.
      </SettingsNote>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.sm },
});
