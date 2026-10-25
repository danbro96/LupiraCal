import { ScrollView, StyleSheet, View } from 'react-native';
import { List } from 'react-native-paper';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { ITEM_COLORS } from '../hooks/palette';
import { ICONS } from '../icons';
import { useColors } from '../theme';

const SWATCHES = Object.entries(ITEM_COLORS);

/** '' = the calendar's colour. */
export function ColorSheet({ value, calendarFill, onPick, onDismiss }: {
  value: string;
  calendarFill: string;
  onPick: (color: string) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const row = (color: string, title: string, fill: string) => (
    <List.Item
      key={color}
      title={title}
      left={() => <View style={[styles.dot, { backgroundColor: fill }]} />}
      right={() => (color === value ? <List.Icon icon={ICONS.check} color={c.primary} /> : null)}
      onPress={() => {
        onPick(color);
        onDismiss();
      }}
    />
  );
  return (
    <Sheet title="Colour" onDismiss={onDismiss}>
      <ScrollView>
        {row('', 'Calendar colour', calendarFill)}
        {SWATCHES.map(([name, fill]) => row(name, name, fill))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  dot: { width: 16, height: 16, borderRadius: 8, alignSelf: 'center', marginLeft: 8 },
});
