import { Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { spacing, useColors } from '../theme';

/** Explanatory text under a settings row, lined up with the row's title. */
export function SettingsNote({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={[styles.note, { color: c.textMuted }]}>{children}</Text>;
}

/** A line that needs attention and fixes itself on tap — a missing permission, a failed upload, an erase. */
export function SettingsAction({ tone = 'warning', onPress, children }: {
  tone?: 'warning' | 'danger';
  onPress: () => void;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.action}>
      <Text style={[styles.actionText, { color: tone === 'danger' ? c.danger : c.warning }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  action: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  actionText: { fontSize: 14 },
});
