import { displayTitle, statusBadge } from '@danbro96/lupira-domain-events/itemLabels';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { memo, useDeferredValue, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import type { ItemSearchRow } from '../../data/queries/search';
import { useItemSearch } from '../../state/useItemSearch';
import { Glyph } from '@danbro96/lupira-expo-paper/components/Glyph';
import { ScreenToolbar } from '@danbro96/lupira-expo-paper/components/ScreenToolbar';
import { useCalendarColors } from '../hooks/palette';
import { ICONS } from '../icons';
import type { RootStackParamList } from '../navigation/types';
import { useColors, spacing } from '../theme';

const MIN_QUERY = 2;

/** Offline search over the mirror's events, reached from the Calendar header. Upcoming first, then past. */
export function ItemSearchScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());
  const ready = q.length >= MIN_QUERY;
  const { data, isFetching } = useItemSearch(ready ? q : '');

  const rows = ready ? data ?? [] : [];
  const upcoming = rows.filter((r) => r.next_utc !== null);
  const past = rows.filter((r) => r.next_utc === null);
  const sections = [
    ...(upcoming.length ? [{ title: 'Upcoming', data: upcoming }] : []),
    ...(past.length ? [{ title: 'Past', data: past }] : []),
  ];

  const open = (itemId: string) => navigation.navigate('ItemDetail', { itemId });

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScreenToolbar>
        <Searchbar
          style={styles.search}
          placeholder="Search events"
          autoFocus
          autoCapitalize="none"
          value={query}
          onChangeText={setQuery}
          loading={ready && isFetching}
        />
      </ScreenToolbar>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => (
          <Text style={[styles.header, { color: c.textMuted, backgroundColor: c.surface }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => <ResultRow row={item} onOpen={open} />}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.textMuted }]}>
            {!ready ? 'Title, description, category or tag' : isFetching ? '' : 'No matching events'}
          </Text>
        }
      />
    </View>
  );
}

const ResultRow = memo(function ResultRow({ row, onOpen }: { row: ItemSearchRow; onOpen: (itemId: string) => void }) {
  const c = useColors();
  const colorOf = useCalendarColors();
  const when = row.next_utc ?? row.last_utc;
  return (
    <Pressable style={styles.row} android_ripple={{ color: c.divider }} onPress={() => onOpen(row.id)}>
      <View style={[styles.dot, { backgroundColor: colorOf(row.calendar_id) }]} />
      <View style={styles.rowText}>
        <Text variant="bodyLarge" numberOfLines={1} style={{ color: c.text }}>{displayTitle(row.title)}</Text>
        <Text variant="bodyMedium" numberOfLines={1} style={{ color: c.textMuted }}>
          {when ? fmtWhen(when, row.is_all_day === 1) : 'No date'}
          {row.recurrence_rule ? <> · <Glyph name={ICONS.repeat} /></> : null}
          {statusBadge(row.status) ? ` · ${statusBadge(row.status)}` : null}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: { flex: 1 },
  header: { fontSize: 13, fontWeight: '700', paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 32 },
});
