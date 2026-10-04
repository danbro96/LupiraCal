import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { List, Switch, Text } from 'react-native-paper';
import { usePhotoBackup } from '../../state/photo-backup-store';
import { usePhotoBackupStatus } from '../../sync/photoBackupStatus';
import { retryParkedPhotos, runPhotoBackup } from '../../sync/photoUploader';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { DateField } from '../components/DateField';
import { SettingsAction, SettingsNote } from '../components/SettingsText';
import { spacing, useColors } from '../theme';

export function PhotoSettingsScreen() {
  const c = useColors();
  const photos = usePhotoBackup();
  const status = usePhotoBackupStatus();
  const confirm = useConfirm();

  const toggle = (value: boolean) => {
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <List.Item
        title="Back up photos & videos"
        right={() => <Switch value={photos.settings.enabled} onValueChange={toggle} disabled={!photos.loaded} />}
      />
      {photos.settings.enabled && (
        <>
          <List.Item
            title="Only on Wi-Fi"
            right={() => (
              <Switch value={photos.settings.wifiOnly} onValueChange={(v) => void usePhotoBackup.getState().setWifiOnly(v)} />
            )}
          />
          <View style={styles.row}>
            <Text style={[styles.label, { color: c.text }]}>Back up from</Text>
            <DateField
              value={photos.settings.backupFrom.slice(0, 10)}
              onChange={(day) => day && void usePhotoBackup.getState().setBackupFrom(new Date(`${day}T00:00:00`).toISOString())}
            />
          </View>
          <SettingsNote>
            {status.progress
              ? `Uploading… ${Math.round(status.progress.fraction * 100)}%`
              : status.pending > 0
                ? `${status.pending} waiting to upload`
                : `${status.done} backed up`}
          </SettingsNote>
          {status.parked > 0 && (
            <SettingsAction onPress={() => void retryParkedPhotos()}>{status.parked} failed — tap to retry</SettingsAction>
          )}
        </>
      )}
      <SettingsNote>
        Originals upload straight to your own storage. Bulk backup runs while the app is open; in the background it
        catches up slowly.
      </SettingsNote>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  label: { fontSize: 16 },
});
