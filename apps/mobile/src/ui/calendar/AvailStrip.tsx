import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { availabilityColor } from '../hooks/palette';

/** A day's availability band: one segment per status the day carries — the web shows each too. */
export function AvailStrip({ statuses, style }: { statuses: readonly (string | null)[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.strip, style]}>
      {statuses.map((s, i) => (
        <View key={`${s}-${i}`} style={[styles.segment, { backgroundColor: availabilityColor(s) }]} />
      ))}
    </View>
  );
}

/** Adds a status to a day's list once, keeping first-seen order. */
export function addStatus(byDay: Map<string, (string | null)[]>, day: string, status: string | null): void {
  const list = byDay.get(day) ?? [];
  if (!list.includes(status)) list.push(status);
  byDay.set(day, list);
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 1, height: 3 },
  segment: { flex: 1, borderRadius: 2 },
});
