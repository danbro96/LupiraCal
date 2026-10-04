import { ScrollView, StyleSheet, View } from 'react-native';
import { List, Text } from 'react-native-paper';
import { calendarLabel } from '@lupira/cal-domain/calendars';
import type { CalendarMembership } from '../../domain/docTypes';
import type { CalendarContainer } from '../../state/useContainers';
import { Sheet } from '../components/Sheet';
import { useCalendarColors } from '../hooks/palette';
import { ICONS } from '../icons';
import { useColors } from '../theme';

/** Multi-select filing. The last calendar can't be deselected — an event with none drops to curation. */
export function CalendarsSheet({ calendars, memberships, selected, onChange, onDismiss }: {
  calendars: CalendarContainer[];
  memberships: CalendarMembership[];
  selected: string[];
  onChange: (calendarIds: string[]) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const colorOf = useCalendarColors();
  const proposed = new Set(memberships.filter((m) => m.status === 'Proposed').map((m) => m.calendarId));

  const toggle = (id: string) => {
    if (!selected.includes(id)) onChange([...selected, id]);
    else if (selected.length > 1) onChange(selected.filter((s) => s !== id));
  };

  return (
    <Sheet title="Calendars" onDismiss={onDismiss}>
      <ScrollView>
        {calendars.map((cal) => {
          const on = selected.includes(cal.id);
          return (
            <List.Item
              key={cal.id}
              title={calendarLabel(cal)}
              description={!on && proposed.has(cal.id) ? 'Proposed — select to accept' : undefined}
              left={() => <View style={[styles.dot, { backgroundColor: colorOf(cal.id) }]} />}
              right={() => (on ? <List.Icon icon={ICONS.check} color={c.primary} /> : null)}
              onPress={() => toggle(cal.id)}
            />
          );
        })}
      </ScrollView>
      {selected.length === 1 && (
        <Text style={[styles.hint, { color: c.textMuted }]}>An event stays in at least one calendar.</Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: 6, alignSelf: 'center', marginLeft: 8 },
  hint: { fontSize: 13, marginTop: 4 },
});
