import { INDEX_LETTERS, indexByLetter, sectionFor, sectionOffsets, type LetterEntry } from '@lupira/cal-domain/letterIndex';
import { partialDateBadge } from '@lupira/cal-domain/partialDate';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar, FAB, Searchbar, Text } from 'react-native-paper';
import type { ContactListRow } from '../../data/mirror';
import { useContactList } from '../../state/useContactList';
import { hashColor } from '../hooks/palette';
import { ScreenToolbar } from '../components/ScreenToolbar';
import { SyncBanner } from '../components/SyncBanner';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '../components/Glyph';
import { LetterRail } from '../components/LetterRail';

type Entry = LetterEntry<ContactListRow>;

const entryKey = (e: Entry) => (e.kind === 'header' ? `#${e.letter}` : e.item.id);
const entryType = (e: Entry) => e.kind;
const nameOf = (r: ContactListRow) => r.displayName;
// Fixed so a rail jump is one computed scrollToOffset; FlashList's scrollToIndex measures its way
// there over several render passes, and a drag along the rail stacks those up.
const HEADER_HEIGHT = 28;
const ROW_HEIGHT = 64;

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
  const { entries, headerAt } = useMemo(() => indexByLetter(rows, nameOf), [rows]);
  const stickyHeaderIndices = useMemo(() => [...headerAt.values()], [headerAt]);
  const presentLetters = useMemo(() => new Set(headerAt.keys()), [headerAt]);

  const offsets = useMemo(() => sectionOffsets(headerAt, HEADER_HEIGHT, ROW_HEIGHT), [headerAt]);
  const contentHeight = headerAt.size * HEADER_HEIGHT + (entries.length - headerAt.size) * ROW_HEIGHT;

  const listRef = useRef<FlashListRef<Entry>>(null);
  const pendingOffset = useRef<number | null>(null);
  // One scroll per frame, to the latest letter: a fast drag skips the letters the list couldn't keep up with.
  const jumpTo = useCallback((letter: string) => {
    const offset = sectionFor(offsets, letter);
    if (offset === undefined) return;
    const scheduled = pendingOffset.current !== null;
    pendingOffset.current = offset;
    if (scheduled) return;
    requestAnimationFrame(() => {
      if (pendingOffset.current !== null) listRef.current?.scrollToOffset({ offset: pendingOffset.current, animated: false });
      pendingOffset.current = null;
    });
  }, [offsets]);

  // Stable, so the memoized rows skip re-rendering on each keystroke in the search box.
  const openContact = useCallback(
    (contactId: string) => navigation.navigate('ContactDetail', { contactId }),
    [navigation],
  );
  const renderItem = useCallback(
    ({ item }: { item: Entry }) => item.kind === 'header'
      ? <SectionHeader letter={item.letter} />
      : <ContactRow row={item.item} onOpen={openContact} />,
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
      <View style={styles.body}>
        <View style={styles.listArea}>
          {/* Clipped to the content, so a short list never shows placeholders below its last row. */}
          <SkeletonRows height={contentHeight} />
          <FlashList
            ref={listRef}
            style={styles.list}
            data={entries}
            keyExtractor={entryKey}
            getItemType={entryType}
            stickyHeaderIndices={stickyHeaderIndices}
            ListEmptyComponent={empty}
            renderItem={renderItem}
            // The rail is the scroll affordance; the native indicator is proportional and would disagree with it.
            showsVerticalScrollIndicator={false}
          />
        </View>
        {!q && entries.length > 0 && (
          <LetterRail letters={INDEX_LETTERS} present={presentLetters} onSelect={jumpTo} />
        )}
      </View>
    </View>
  );
}

const SKELETON_ROWS = Array.from({ length: 16 }, (_, i) => i);

/** Sits behind the list: after a rail jump the list scrolls before its rows render, and the gap
 *  shows these instead of a blank frame. Rows are opaque so it never shows through them. */
const SkeletonRows = memo(function SkeletonRows({ height }: { height: number }) {
  const c = useColors();
  return (
    <View pointerEvents="none" style={[styles.skeleton, { height }]}>
      {SKELETON_ROWS.map((i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.skeletonAvatar, { backgroundColor: c.surface }]} />
          <View style={styles.rowText}>
            <View style={[styles.skeletonBar, { width: '55%', backgroundColor: c.surface }]} />
            <View style={[styles.skeletonBar, { width: '35%', backgroundColor: c.surface }]} />
          </View>
        </View>
      ))}
    </View>
  );
});

const SectionHeader = memo(function SectionHeader({ letter }: { letter: string }) {
  const c = useColors();
  return (
    <View style={[styles.header, { backgroundColor: c.surface }]}>
      <Text style={[styles.headerText, { color: c.textMuted }]}>{letter}</Text>
    </View>
  );
});

const ContactRow = memo(function ContactRow({ row, onOpen }: { row: ContactListRow; onOpen: (contactId: string) => void }) {
  const c = useColors();
  const firstChannel = (row.doc.channels ?? []).find((c) => c.preferred) ?? (row.doc.channels ?? [])[0];
  // Plain views rather than Paper's List.Item: a rail jump mounts a whole screen of rows at once.
  return (
    <Pressable style={[styles.row, { backgroundColor: c.bg }]} android_ripple={{ color: c.divider }} onPress={() => onOpen(row.id)}>
      <Avatar.Text size={38} label={initialsOf(row.displayName)} style={{ backgroundColor: hashColor(row.id) }} />
      <View style={styles.rowText}>
        <Text variant="bodyLarge" numberOfLines={1} style={{ color: c.text }}>{row.displayName}</Text>
        {firstChannel?.value ? (
          <Text variant="bodyMedium" numberOfLines={1} style={{ color: c.textMuted }}>{firstChannel.value}</Text>
        ) : null}
      </View>
      {row.doc.birthday ? (
        <Text style={[styles.bday, { color: c.warning }]}><Glyph name={ICONS.cake} /> {partialDateBadge(row.doc.birthday)}</Text>
      ) : null}
    </Pressable>
  );
});

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
  list: { flex: 1 },
  listArea: { flex: 1, overflow: 'hidden' },
  header: { height: HEADER_HEIGHT, justifyContent: 'center', paddingHorizontal: 16 },
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  rowText: { flex: 1 },
  skeleton: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  skeletonAvatar: { width: 38, height: 38, borderRadius: 19 },
  skeletonBar: { height: 10, borderRadius: 5, marginVertical: 4 },
  headerText: { fontSize: 13, fontWeight: '700' },
  search: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 32 },
  bday: { fontSize: 12 },
});
