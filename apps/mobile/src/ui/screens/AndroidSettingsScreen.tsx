import { Linking, ScrollView, StyleSheet } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { useBridge } from '../../state/bridge-store';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { SettingsAction, SettingsNote } from '../components/SettingsText';
import { spacing } from '../theme';

export function AndroidSettingsScreen() {
  const bridge = useBridge();
  const confirm = useConfirm();

  const toggle = (value: boolean) => {
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
      <List.Item
        title="Sync with Android calendar & contacts"
        titleNumberOfLines={2}
        right={() => <Switch value={bridge.enabled} onValueChange={toggle} disabled={!bridge.loaded} />}
      />
      {bridge.enabled && (
        <SettingsNote>
          {bridge.status?.accountPresent ? 'Account active' : 'Account missing — toggle off and on to repair'}
          {bridge.status?.lastSyncAt ? ` · last OS sync ${new Date(bridge.status.lastSyncAt).toLocaleString()}` : ''}
        </SettingsNote>
      )}
      {!bridge.permissionsOk && (
        <SettingsAction onPress={() => void Linking.openSettings()}>
          Calendar/contacts permissions missing — tap to open app settings
        </SettingsAction>
      )}
      <SettingsNote>
        Your Lupira calendars and contacts appear in the phone’s own apps, and edits made there sync back.
      </SettingsNote>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.sm },
});
