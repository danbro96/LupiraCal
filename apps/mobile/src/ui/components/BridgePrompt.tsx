import { StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { useBridge } from '../../state/bridge-store';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';

/** One-time post-sign-in card: sets up the Android integration (permissions + account + first
 *  publish) or goes quiet forever. An inline card, not an Alert — it may wait across launches. */
export function BridgePrompt() {
  const { loaded, prompted, enabled } = useBridge();
  if (!loaded || prompted || enabled) return null;

  return (
    <Card mode="contained" style={styles.card}>
      <Card.Title title="Show in Android calendar & contacts?" titleVariant="titleMedium" />
      <Card.Content>
        <Text variant="bodyMedium">
          Your events and contacts can appear in this phone's own calendar and contacts apps, and edits
          there sync back. You can change this anytime in Settings.
        </Text>
      </Card.Content>
      <Card.Actions>
        <Button title="Enable" onPress={() => void useBridge.getState().enable().catch(() => toastError('Could not set up the Android integration.'))} />
        <Button title="Not now" variant="secondary" onPress={() => void useBridge.getState().markPrompted()} />
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { margin: 10 },
});
