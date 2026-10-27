import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { FAB, List, Switch, Text } from 'react-native-paper';
import type { SubscriptionDto } from '@lupira/cal-api/models';
import { canManageSubscriptions, isRefreshPending, subscriptionStatus, type SubscriptionTone } from '@lupira/cal-domain/subscriptions';
import { plural } from '@danbro96/lupira-domain-core/wording';
import { detach } from '@danbro96/lupira-expo-diagnostics/log';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { IconButton } from '@danbro96/lupira-expo-paper/components/IconButton';
import { SettingsNote } from '@danbro96/lupira-expo-paper/components/SettingsNote';
import { StatusBanner } from '@danbro96/lupira-expo-paper/components/StatusBanner';
import { errorText } from '@danbro96/lupira-http/apiError';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { usePrefs } from '../../state/prefs-store';
import { useCalendars } from '../../state/useContainers';
import { useSubscriptionMutations, useSubscriptions } from '../../state/useSubscriptions';
import { useCalendarColors } from '../hooks/palette';
import { ICONS } from '../icons';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors, type Palette } from '../theme';

const NEEDS_CONNECTION = { kind: 'offline', text: 'Needs a connection', quiet: false } as const;

const toneColor = (tone: SubscriptionTone, c: Palette) => (tone === 'ok' ? c.success : tone === 'error' ? c.danger : c.textMuted);

/** A calendar's subscribed feeds: every member sees them with their sync status and can hide one on this device;
 *  owners add, refresh, edit and remove them. */
export function CalendarSubscriptionsScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { calendarId } = useRoute<RouteProp<RootStackParamList, 'CalendarSubscriptions'>>().params;
  const online = useOnline();
  const calendar = useCalendars().data?.find((cal) => cal.id === calendarId);
  const canManage = !!calendar && canManageSubscriptions(calendar);
  const { data: subscriptions, isLoading, isRefetching, refetch } = useSubscriptions(calendarId);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBanner state={online ? null : NEEDS_CONNECTION} progress={false} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl enabled={online} refreshing={isRefetching} onRefresh={() => detach(refetch(), 'subscriptions:refetch')} />}
      >
        {isLoading && <SettingsNote>Loading…</SettingsNote>}
        {subscriptions?.length === 0 && <SettingsNote>No subscribed calendars.</SettingsNote>}
        {subscriptions?.map((s) => (
          <SubscriptionRow
            key={s.id}
            s={s}
            canManage={canManage && online}
            onEdit={() => navigation.navigate('SubscriptionForm', { calendarId, subscriptionId: s.id })}
          />
        ))}
        <SettingsNote>Events from subscribed calendars are read-only. Hiding one applies to this device only.</SettingsNote>
      </ScrollView>
      {canManage && online && (
        <FAB
          icon={ICONS.add}
          style={styles.fab}
          accessibilityLabel="Subscribe to a calendar"
          onPress={() => navigation.navigate('SubscriptionForm', { calendarId })}
        />
      )}
    </View>
  );
}

function SubscriptionRow({ s, canManage, onEdit }: { s: SubscriptionDto; canManage: boolean; onEdit: () => void }) {
  const c = useColors();
  const colorOf = useCalendarColors();
  const hidden = usePrefs((p) => p.hiddenSubscriptionIds.includes(s.id));
  const loaded = usePrefs((p) => p.loaded);
  const { refresh } = useSubscriptionMutations(s.calendarId);
  const now = new Date();
  const status = subscriptionStatus(s, now);

  return (
    <List.Item
      title={s.displayName}
      description={() => (
        <View>
          <Text style={[styles.line, { color: c.textMuted }]} numberOfLines={1}>{`${s.sourceHost} · ${plural(s.eventCount, 'event')}`}</Text>
          <Text style={[styles.line, { color: toneColor(status.tone, c) }]}>{status.text}</Text>
        </View>
      )}
      onPress={canManage ? onEdit : undefined}
      left={(p) => <View style={[p.style, styles.dot, { backgroundColor: colorOf(s.calendarId, undefined, s.color) }]} />}
      right={() => (
        <View style={styles.actions}>
          {canManage && (
            <IconButton
              name={ICONS.sync}
              accessibilityLabel={`Refresh ${s.displayName}`}
              disabled={isRefreshPending(s, now) || refresh.isPending}
              onPress={() => refresh.mutate(s.id, { onError: (e) => toastError(errorText(e)) })}
            />
          )}
          <Switch
            value={!hidden}
            disabled={!loaded}
            onValueChange={(v) => void usePrefs.getState().setSubscriptionShown(s.id, v).catch(() => toastError('Could not save the setting.'))}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingVertical: spacing.sm, paddingBottom: 88 },
  dot: { width: 14, height: 14, borderRadius: 7, alignSelf: 'center' },
  line: { fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
});
