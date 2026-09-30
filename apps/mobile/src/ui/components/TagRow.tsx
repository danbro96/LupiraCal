import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { spacing, useColors } from '../theme';

/** Tags as quiet text rather than chips — they label a card, they aren't what it's about. */
export function TagRow({ tags }: { tags: readonly string[] | null | undefined }) {
  const c = useColors();
  if (!tags?.length) return null;
  return <Text style={[styles.tags, { color: c.textSubtle }]}>{tags.map((t) => `#${t}`).join('   ')}</Text>;
}

const styles = StyleSheet.create({
  tags: { fontSize: 12, lineHeight: 18, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
});
