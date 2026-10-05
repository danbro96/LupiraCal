import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useColors, spacing } from '../theme';

export function Centered({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={styles.centered}>
      <Text variant="bodyMedium" style={{ color: c.textMuted }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
