import { partialDateBadge } from '@lupira/cal-domain/partialDate';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Avatar, FAB, List, Searchbar, Text } from 'react-native-paper';
import type { ContactListRow } from '../../data/mirror';
import { useContactList } from '../../state/useContactList';
import { hashColor } from '../hooks/palette';
import { ScreenToolbar } from '../components/ScreenToolbar';
import { SyncBanner } from '../components/SyncBanner';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '../components/Glyph';

const contactKey = (r: ContactListRow) => r.id;

export function ContactsScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data } = useContactList();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => (data ?? []).filter((r) =>
    !q
    || r.displayName.toLowerCase().includes(q)
    || (r.doc.nickname ?? '').toLowerCase().includes(q)
    || (r.doc.tags ?? []).some((t) => t.toLowerCase().includes(q))), [data, q]);

  // Stable, so the memoized rows skip re-rendering on each keystroke in the search box.
  const openContact = useCallback(
    (contactId: string) => navigation.navigate('ContactDetail', { contactId }),
    [navigation],
  );
  const renderItem = useCallback(
    ({ item }: { item: ContactListRow }) => <ContactRow row={item} onOpen={openContact} />,
    [openContact],
  );
  const hasContacts = !!data?.length;
  const empty = useMemo(() => (
    <Text style={[styles.empty, { color: c.textMuted }]}>
      {hasContacts ? 'No matches' : 'No contacts in the mirror yet'}
    </Text>
  ), [hasContacts, c.textMuted]);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <SyncBanner />
      <ScreenToolbar>
        <Searchbar
          style={styles.search}
          placeholder="Search contacts"
          autoCapitalize="none"
          value={query}
          onChangeText={setQuery}
        />
        <FAB size="small" icon={ICONS.add} onPress={() => navigation.navigate('ContactEdit', {})} />
      </ScreenToolbar>
      <FlatList
        data={rows}
        keyExtractor={contactKey}
        ListEmptyComponent={empty}
        renderItem={renderItem}
        // The whole address book is one list; the default window mounts ~21 screens of it.
        initialNumToRender={15}
        windowSize={7}
      />
    </View>
  );
}

const ContactRow = memo(function ContactRow({ row, onOpen }: { row: ContactListRow; onOpen: (contactId: string) => void }) {
  const c = useColors();
  const firstChannel = (row.doc.channels ?? []).find((c) => c.preferred) ?? (row.doc.channels ?? [])[0];
  return (
    <List.Item
      onPress={() => onOpen(row.id)}
      title={row.displayName}
      description={firstChannel?.value}
      descriptionNumberOfLines={1}
      left={() => (
        <Avatar.Text size={38} label={initialsOf(row.displayName)} style={{ backgroundColor: hashColor(row.id) }} />
      )}
      right={() =>
        row.doc.birthday ? (
          <Text style={[styles.bday, { color: c.warning }]}><Glyph name={ICONS.cake} /> {partialDateBadge(row.doc.birthday)}</Text>
        ) : null
      }
    />
  );
});

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 32 },
  bday: { fontSize: 12 },
});
