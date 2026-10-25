import { toast, toastError } from '@danbro96/lupira-expo-feedback/toast';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, List } from 'react-native-paper';
import type { ContactGroupDoc } from '../../domain/docTypes';
import { editableGroupIds, groupsToJoin, isMember } from '../../domain/groupMembership';
import { addToGroup, removeFromGroup } from '../../state/actions';
import { useAddressBooks } from '../../state/useAddressBooks';
import { useContactGroups } from '../../state/useContactGroups';
import { ICONS } from '../icons';
import { spacing } from '../theme';

const groupIcon = (g: ContactGroupDoc) => (g.kind === 'Organization' ? ICONS.work : ICONS.group);

export function ContactGroupChips({ contactId, addressBookId }: { contactId: string; addressBookId: string }) {
  const { data: groups = [] } = useContactGroups();
  const { data: books = [] } = useAddressBooks();
  const [adding, setAdding] = useState(false);
  const editable = editableGroupIds(groups, books);
  const mine = groups.filter((g) => isMember(g, contactId));
  const joinable = groupsToJoin(groups, editable, { id: contactId, addressBookId });
  if (mine.length === 0 && joinable.length === 0) return null;

  const join = (g: ContactGroupDoc) => {
    setAdding(false);
    addToGroup(g.id, contactId)
      .then(() => toast(`Added to ${g.name}`))
      .catch(() => toastError('Could not add to the group.'));
  };

  return (
    <View style={styles.chips}>
      {mine.map((g) => (
        <Chip
          key={g.id}
          compact
          mode="outlined"
          icon={groupIcon(g)}
          closeIcon={ICONS.close}
          onClose={editable.has(g.id) ? () => void removeFromGroup(g.id, contactId).catch(() => toastError('Could not remove from the group.')) : undefined}
          closeIconAccessibilityLabel={`Remove from ${g.name}`}
        >
          {g.name}
        </Chip>
      ))}
      {joinable.length > 0 && <Chip compact mode="outlined" icon={ICONS.add} onPress={() => setAdding(true)}>Add to group</Chip>}
      {adding && (
        <Sheet title="Add to group" onDismiss={() => setAdding(false)}>
          <ScrollView>
            {joinable.map((g) => (
              <List.Item key={g.id} title={g.name} left={(p) => <List.Icon {...p} icon={groupIcon(g)} />} onPress={() => join(g)} />
            ))}
          </ScrollView>
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
});
