import { calendarLabel, isCalendarShown } from '@lupira/cal-domain/calendars';
import { ScrollView, StyleSheet, View } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { ALL_DAY_ROW_OPTIONS, usePrefs } from '../../state/prefs-store';
import { useCalendars, type CalendarContainer } from '../../state/useContainers';
import { SegmentedPicker } from '@danbro96/lupira-expo-paper/components/SegmentedPicker';
import { SettingsNote } from '../components/SettingsText';
import { useCalendarColors } from '../hooks/palette';
import { spacing } from '../theme';

const ACCESS_LABELS: Record<string, string> = { Owner: 'Owner', ReadWrite: 'Can edit', Read: 'View only' };

export function CalendarSettingsScreen() {
  const prefs = usePrefs();
  const { data: calendars = [] } = useCalendars();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <CalendarGroup title="Calendars" calendars={calendars.filter((c) => c.class !== 'System')} />
      <CalendarGroup title="System" calendars={calendars.filter((c) => c.class === 'System')} />
      <SettingsNote>Agent-managed calendars (inbox, prompts …). Hidden until switched on.</SettingsNote>
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
      <SettingsNote>Deadlines from Lupira Tasks appear on their due day. Needs a connection.</SettingsNote>
      <List.Item title="All-day rows in week view" />
      <View style={styles.picker}>
        <SegmentedPicker
          options={ALL_DAY_ROW_OPTIONS}
          selected={prefs.allDayRows}
          onSelect={(v) => void usePrefs.getState().setAllDayRows(v)}
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

function CalendarGroup({ title, calendars }: { title: string; calendars: CalendarContainer[] }) {
  const choices = usePrefs((p) => p.calendarChoices);
  const loaded = usePrefs((p) => p.loaded);
  const colorOf = useCalendarColors();
  if (calendars.length === 0) return null;
  return (
    <>
      <List.Subheader>{title}</List.Subheader>
      {calendars.map((c) => (
        <List.Item
          key={c.id}
          title={calendarLabel(c)}
          description={ACCESS_LABELS[c.access ?? ''] ?? c.access}
          left={(p) => <View style={[p.style, styles.dot, { backgroundColor: colorOf(c.id) }]} />}
          right={() => (
            <Switch
              value={isCalendarShown(c, choices)}
              onValueChange={(v) => void usePrefs.getState().setCalendarShown(c.id, v)}
              disabled={!loaded}
            />
          )}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7, alignSelf: 'center' },
  picker: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
