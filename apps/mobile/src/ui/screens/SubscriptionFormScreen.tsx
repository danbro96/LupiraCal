import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { HelperText, List, Text } from 'react-native-paper';
import type { ItemColor, SubscriptionDto } from '@lupira/cal-api/models';
import { detach } from '@danbro96/lupira-expo-diagnostics/log';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { errorText } from '@danbro96/lupira-http/apiError';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { useSubscriptionMutations, useSubscriptions } from '../../state/useSubscriptions';
import { Centered } from '../components/Centered';
import { ColorSheet } from '../event/ColorSheet';
import { useCalendarColors } from '../hooks/palette';
import { ICONS } from '../icons';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors } from '../theme';

export function SubscriptionFormScreen() {
  const { calendarId, subscriptionId } = useRoute<RouteProp<RootStackParamList, 'SubscriptionForm'>>().params;
  const { data: subscriptions, isLoading } = useSubscriptions(calendarId);
  if (!subscriptionId) return <SubscriptionForm calendarId={calendarId} />;
  const subscription = subscriptions?.find((s) => s.id === subscriptionId);
  if (subscription) return <SubscriptionForm calendarId={calendarId} subscription={subscription} />;
  return <Centered text={isLoading ? 'Loading…' : 'Subscription not found (or no access).'} />;
}

/** The server never hands the address back (a secret address works like a password), so editing only replaces it. */
function SubscriptionForm({ calendarId, subscription }: { calendarId: string; subscription?: SubscriptionDto }) {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const online = useOnline();
  const confirm = useConfirm();
  const colorOf = useCalendarColors();
  const { create, update, remove } = useSubscriptionMutations(calendarId);
  const [feedUrl, setFeedUrl] = useState('');
  const [displayName, setDisplayName] = useState(subscription?.displayName ?? '');
  const [color, setColor] = useState<string>(subscription?.color ?? '');
  const [picking, setPicking] = useState(false);

  const busy = create.isPending || update.isPending || remove.isPending;
  const ready = online && !busy && !!displayName.trim() && (!!subscription || !!feedUrl.trim());
  const onError = (e: unknown) => toastError(errorText(e));

  const save = () => {
    const name = displayName.trim();
    const itemColor = (color || null) as ItemColor | null;
    if (subscription) {
      update.mutate(
        { subscriptionId: subscription.id, body: { displayName: name, color: itemColor, feedUrl: feedUrl.trim() || null } },
        { onSuccess: () => navigation.goBack(), onError },
      );
    } else {
      create.mutate({ feedUrl: feedUrl.trim(), displayName: name, color: itemColor }, { onSuccess: () => navigation.goBack(), onError });
    }
  };

  const removeSubscription = async () => {
    if (!subscription) return;
    const ok = await confirm({
      title: 'Remove subscription?',
      message: `Remove “${subscription.displayName}” and its events from this calendar?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) remove.mutate(subscription.id, { onSuccess: () => navigation.goBack(), onError });
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.inset}>
          <TextField
            label={subscription ? 'New calendar address (optional)' : 'Calendar address'}
            style={fieldGap}
            value={feedUrl}
            onChangeText={setFeedUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={2048}
          />
          {subscription && <Text style={[styles.note, { color: c.textMuted }]}>Now from {subscription.sourceHost}</Text>}
          <Text style={[styles.note, { color: c.textMuted }]}>
            Paste the calendar's published address. Google Calendar: Settings → your calendar → Secret address in iCal format.
            Outlook: Settings → Calendar → Shared calendars → Publish a calendar → ICS link.
          </Text>
          <TextField label="Name" style={fieldGap} value={displayName} onChangeText={setDisplayName} maxLength={100} />
        </View>
        <List.Item
          title="Colour"
          description={color || 'Calendar colour'}
          left={() => <View style={[styles.dot, { backgroundColor: colorOf(calendarId, undefined, color || null) }]} />}
          right={(p) => <List.Icon {...p} icon={ICONS.chevronRight} />}
          onPress={() => setPicking(true)}
        />
        <View style={styles.inset}>
          <HelperText type="info" visible={!online}>Needs a connection</HelperText>
          <View style={styles.buttons}>
            <Button title={subscription ? 'Save' : 'Subscribe'} onPress={save} disabled={!ready} loading={create.isPending || update.isPending} />
            <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
          </View>
          {subscription && (
            <Button title="Remove" variant="destructive" onPress={() => detach(removeSubscription(), 'subscriptions:remove')} disabled={!online || busy} style={styles.remove} />
          )}
        </View>
      </ScrollView>
      {picking && <ColorSheet value={color} calendarFill={colorOf(calendarId)} onPick={setColor} onDismiss={() => setPicking(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.md },
  inset: { paddingHorizontal: spacing.lg },
  note: { fontSize: 13, marginBottom: spacing.sm },
  dot: { width: 16, height: 16, borderRadius: 8, alignSelf: 'center', marginLeft: spacing.lg },
  buttons: { flexDirection: 'row', gap: 10 },
  remove: { marginTop: spacing.lg, alignSelf: 'flex-start' },
});
