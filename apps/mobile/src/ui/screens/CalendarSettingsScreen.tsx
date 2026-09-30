import { ScrollView, StyleSheet, View } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { ALL_DAY_ROW_OPTIONS, usePrefs } from '../../state/prefs-store';
import { SegmentedPicker } from '../components/SegmentedPicker';
import { SettingsNote } from '../components/SettingsText';
import { spacing } from '../theme';

export function CalendarSettingsScreen() {
  const prefs = usePrefs();
  return (
    <ScrollView contentContainerStyle={styles.container}>
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
      <SettingsNote>Agent-managed calendars (inbox, prompts …) and their events stay hidden unless enabled.</SettingsNote>
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

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.sm },
  picker: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
