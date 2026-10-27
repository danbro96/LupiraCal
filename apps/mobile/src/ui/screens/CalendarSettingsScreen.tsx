import { calendarLabel, isCalendarShown } from '@lupira/cal-domain/calendars';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, View } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { ALL_DAY_ROW_OPTIONS, usePrefs } from '../../state/prefs-store';
import { useCalendars, type CalendarContainer } from '../../state/useContainers';
import { useSubscriptions } from '../../state/useSubscriptions';
import { SegmentedPicker } from '@danbro96/lupira-expo-paper/components/SegmentedPicker';
import { SettingsNote } from '@danbro96/lupira-expo-paper/components/SettingsNote';
import { useCalendarColors } from '../hooks/palette';
import type { RootStackParamList } from '../navigation/types';
import { spacing } from '../theme';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';

const ACCESS_LABELS: Record<string, string> = { Owner: 'Owner', ReadWrite: 'Can edit', Read: 'View only' };

export function CalendarSettingsScreen() {
  const prefs = usePrefs();
  const { data: calendars = [] } = useCalendars();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <CalendarGroup title="Calendars" calendars={calendars.filter((c) => c.class !== 'System')} subscriptions />
      <CalendarGroup title="System" calendars={calendars.filter((c) => c.class === 'System')} />
      <SettingsNote>Agent-managed calendars (inbox, prompts …). Hidden until switched on.</SettingsNote>
      <List.Item
        title="Show task deadlines"
        right={() => (
          <Switch
            value={prefs.showTaskDeadlines}
            onValueChange={(v) => void usePrefs.getState().setShowTaskDeadlines(v).catch(() => toastError('Could not save the setting.'))}
            disabled={!prefs.loaded}
          />
        )}
      />
      <SettingsNote>Deadlines from Lupira Tasks appear on their due day. Needs a connection.</SettingsNote>
      <List.Item title="All-day rows in week view" />
      <View style={styles.picker}>
        <SegmentedPicker
          options={ALL_DAY_ROW_OPTIONS}
          selected={prefs.allDayRows}
          onSelect={(v) => void usePrefs.getState().setAllDayRows(v).catch(() => toastError('Could not save the setting.'))}
          getLabel={(v) => (v === 'all' ? 'All' : v)}
        />
      </View>
      <SettingsNote>
        The all-day strip is at most this many rows tall; past that, its last row counts what is hidden per day. Tap a
        count to show them all.
      </SettingsNote>
    </ScrollView>
  );
}

function CalendarGroup({ title, calendars, subscriptions = false }: { title: string; calendars: CalendarContainer[]; subscriptions?: boolean }) {
  if (calendars.length === 0) return null;
  return (
    <>
      <List.Subheader>{title}</List.Subheader>
      {calendars.map((c) => (subscriptions ? <SubscribableCalendarRow key={c.id} calendar={c} /> : <CalendarRow key={c.id} calendar={c} />))}
    </>
  );
}

function CalendarRow({ calendar, extra, onPress }: { calendar: CalendarContainer; extra?: string; onPress?: () => void }) {
  const choices = usePrefs((p) => p.calendarChoices);
  const loaded = usePrefs((p) => p.loaded);
  const colorOf = useCalendarColors();
  const access = ACCESS_LABELS[calendar.access ?? ''] ?? calendar.access;
  return (
    <List.Item
      title={calendarLabel(calendar)}
      description={extra ? `${access} · ${extra}` : access}
      onPress={onPress}
      left={(p) => <View style={[p.style, styles.dot, { backgroundColor: colorOf(calendar.id) }]} />}
      right={() => (
        <Switch
          value={isCalendarShown(calendar, choices)}
          onValueChange={(v) => void usePrefs.getState().setCalendarShown(calendar.id, v).catch(() => toastError('Could not save the setting.'))}
          disabled={!loaded}
        />
      )}
    />
  );
}

function SubscribableCalendarRow({ calendar }: { calendar: CalendarContainer }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const count = useSubscriptions(calendar.id).data?.length ?? 0;
  return (
    <CalendarRow
      calendar={calendar}
      extra={count > 0 ? `Subscriptions (${count})` : 'Subscriptions'}
      onPress={() => navigation.navigate('CalendarSubscriptions', { calendarId: calendar.id })}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7, alignSelf: 'center' },
  picker: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
