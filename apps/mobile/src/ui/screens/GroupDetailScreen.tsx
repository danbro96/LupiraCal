import { matchesTerms, searchTerms } from '@danbro96/lupira-domain-core/textSearch';
import { toast, toastError } from '@danbro96/lupira-expo-feedback/toast';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, IconButton, List, Text } from 'react-native-paper';
import type { ContactListRow } from '../../data/queries/contacts';
import type { ContactGroupDoc } from '../../domain/docTypes';
import { editableGroupIds, isMember } from '../../domain/groupMembership';
import { addToGroup, removeFromGroup } from '../../state/actions';
import { useAddressBooks } from '../../state/useAddressBooks';
import { useContactGroups } from '../../state/useContactGroups';
import { useContactList } from '../../state/useContactList';
import { Centered } from '../components/Centered';
import type { RootStackParamList } from '../navigation/types';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';

const LIST_LIMIT = 50;

export function GroupDetailScreen() {
  const c = useColors();
  const { groupId } = useRoute<RouteProp<RootStackParamList, 'GroupDetail'>>().params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: groups, isLoading } = useContactGroups();
  const { data: books = [] } = useAddressBooks();
  const { data: contacts = [] } = useContactList();
  const [adding, setAdding] = useState(false);
  const group = groups?.find((g) => g.id === groupId);
  const name = group?.name;

  useLayoutEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [navigation, name]);

  if (isLoading) return <Centered text="Loading…" />;
  if (!group) return <Centered text="This group is not in the offline mirror." />;
  const editable = editableGroupIds([group], books).has(group.id);
  const byId = new Map(contacts.map((r) => [r.id, r]));
  const members = group.members
    .map((m) => ({ ...m, displayName: byId.get(m.contactId)?.displayName ?? '(not in mirror)' }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.heading}>
        <List.Subheader style={styles.subheader}>Members</List.Subheader>
        {editable && <Button compact icon={ICONS.add} onPress={() => setAdding(true)}>Add member</Button>}
      </View>
      {members.length === 0 && <Text style={[styles.inset, styles.muted, { color: c.textMuted }]}>No members yet</Text>}
      {members.map((m) => (
        <List.Item
          key={m.contactId}
          title={m.displayName}
          description={m.role}
          style={styles.dense}
          left={(p) => <List.Icon {...p} icon={ICONS.person} />}
          right={() => (editable
            ? <IconButton icon={ICONS.close} accessibilityLabel={`Remove ${m.displayName}`} onPress={() => void removeFromGroup(group.id, m.contactId).catch(() => toastError('Could not remove the member.'))} />
            : null)}
          onPress={() => navigation.push('ContactDetail', { contactId: m.contactId })}
        />
      ))}
      {adding && <AddMemberSheet group={group} contacts={contacts} onDismiss={() => setAdding(false)} />}
    </ScrollView>
  );
}

/** Contacts of the group's own address book from the mirror; the add queues like any other write. */
function AddMemberSheet({ group, contacts, onDismiss }: { group: ContactGroupDoc; contacts: ContactListRow[]; onDismiss: () => void }) {
  const c = useColors();
  const [query, setQuery] = useState('');
  const terms = searchTerms(query);
  const rows = contacts
    .filter((r) => r.doc.addressBookId === group.addressBookId && !isMember(group, r.id) && matchesTerms(terms, r.displayName, r.doc.nickname))
    .slice(0, LIST_LIMIT);

  const add = (row: ContactListRow) => {
    onDismiss();
    addToGroup(group.id, row.id)
      .then(() => toast(`Added ${row.displayName} to ${group.name}`))
      .catch(() => toastError('Could not add the member.'));
  };

  return (
    <Sheet anchor="top" title="Add member" onDismiss={onDismiss}>
      <TextField style={fieldGap} label="Search contacts" autoFocus value={query} onChangeText={setQuery} />
      <ScrollView keyboardShouldPersistTaps="handled">
        {rows.length === 0 && <Text style={[styles.hint, { color: c.textMuted }]}>No matching contacts</Text>}
        {rows.map((r) => (
          <List.Item
            key={r.id}
            title={r.displayName}
            description={r.doc.nickname}
            left={(p) => <List.Icon {...p} icon={ICONS.person} />}
            onPress={() => add(r)}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.sm },
  subheader: { flex: 1 },
  inset: { paddingHorizontal: spacing.lg },
  dense: { paddingVertical: 0 },
  muted: { fontSize: 13 },
  hint: { textAlign: 'center', marginVertical: spacing.lg },
});
