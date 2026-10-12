import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';
import { useContactGroups } from '../../state/useContactGroups';
import { ICONS } from '../icons';
import { spacing } from '../theme';

export function ContactGroupChips({ contactId }: { contactId: string }) {
  const { data: groups = [] } = useContactGroups();
  const mine = groups.filter((g) => g.members.some((m) => m.contactId === contactId));
  if (mine.length === 0) return null;
  return (
    <View style={styles.chips}>
      {mine.map((g) => (
        <Chip key={g.id} compact mode="outlined" icon={g.kind === 'Organization' ? ICONS.work : ICONS.group}>{g.name}</Chip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
});
