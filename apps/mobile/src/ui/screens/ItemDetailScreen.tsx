import { describeRrule } from '@lupira/cal-domain/rrule';
import { fmtWhen } from '@lupira/cal-domain/time';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, List, Text } from 'react-native-paper';
import { deleteItem, fileItem, mergeItemMetadata, unfileItem } from '../../state/actions';
import { selectableCalendars, useCalendars } from '../../state/useContainers';
import { useItemState } from '../../state/useItemState';
import { Centered } from '../components/Centered';
import { useConfirm } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useCalendarColors } from '../hooks/palette';
import { EventPhotosRow } from '../photos/EventPhotosRow';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';
import { ICONS } from '../icons';

export function ItemDetailScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'ItemDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { itemId } = route.params;
  const { data: state, isLoading } = useItemState(itemId);
  const confirm = useConfirm();

  if (isLoading) return <Centered text="Loading…" />;
  if (!state) return <Centered text="This item is not in the offline mirror." />;
  const doc = state.doc;

  const start = doc.isAllDay ? doc.startDate : doc.startsAt;
  const end = doc.isAllDay ? doc.endDate : doc.endsAt;
  const attendees = Array.isArray(doc.attendees) ? doc.attendees.length : 0;

  const confirmDelete = async () => {
    const ok = await confirm({
      title: 'Delete event',
      message: `Delete “${doc.title ?? 'this event'}”? It syncs to everyone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) void deleteItem(itemId).then(() => navigation.goBack());
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {state.deleted && <Text style={[styles.deleted, { color: c.danger }]}>Deleted — pending sync</Text>}
      <Text style={styles.h1}>{doc.title ?? '(untitled)'}</Text>
      {start && (
        <Text style={[styles.when, { color: c.textMuted }]}>
          {fmtWhen(start, doc.isAllDay)}
          {end ? ` → ${fmtWhen(end, doc.isAllDay)}` : ''}
        </Text>
      )}
      {doc.recurrenceRule && <Text style={[styles.recur, { color: c.primary }]}>{describeRrule(doc.recurrenceRule)}</Text>}
      <View style={styles.chipRow}>
        {doc.status && <Chip compact mode="outlined">{doc.status}</Chip>}
        {doc.category && <Chip compact mode="outlined">{doc.category}</Chip>}
        {(doc.tags ?? []).map((t) => (
          <Chip key={t} compact>{`#${t}`}</Chip>
        ))}
      </View>
      {doc.description ? <Text style={styles.description}>{doc.description}</Text> : null}
      {attendees > 0 && <Text style={[styles.note, { color: c.textMuted }]}>{attendees} participant{attendees === 1 ? '' : 's'} (manage on web)</Text>}
      {doc.prompt != null && <Text style={[styles.note, { color: c.textMuted }]}>Has a prompt payload (view on web)</Text>}
      {doc.action != null && <Text style={[styles.note, { color: c.textMuted }]}>Has an action payload (view on web)</Text>}

      <EventPhotosRow itemId={itemId} item={doc} />
      <CalendarsPanel itemId={itemId} memberships={doc.calendars} />
      <MetadataPanel itemId={itemId} metadata={doc.metadata ?? null} />

      <View style={styles.buttons}>
        <Button title="Edit" onPress={() => navigation.navigate('ItemEdit', { itemId })} />
        <Button title="Delete" variant="destructive" onPress={() => void confirmDelete()} />
      </View>
    </ScrollView>
  );
}

/** Filing manager: every mirror calendar with a membership toggle → item.file / item.unfile ops. */
function CalendarsPanel({ itemId, memberships }: {
  itemId: string;
  memberships: { calendarId: string; status: string }[];
}) {
  const c = useColors();
  const { data: calendars } = useCalendars();
  const colorOf = useCalendarColors();
  const statusOf = (calId: string) => memberships.find((m) => m.calendarId === calId)?.status;

  return (
    <View>
      <List.Subheader>Calendars</List.Subheader>
      {selectableCalendars(calendars).map((cal) => {
        const status = statusOf(cal.id);
        const member = status === 'Accepted' || status === 'Proposed';
        return (
          <List.Item
            key={cal.id}
            onPress={() => void (member ? unfileItem(itemId, cal.id) : fileItem(itemId, cal.id))}
            title={cal.displayName ?? cal.id}
            description={status === 'Proposed' ? 'proposed' : undefined}
            left={() => <View style={[styles.calDot, { backgroundColor: colorOf(cal.id) }]} />}
            right={() => (member ? <List.Icon icon={ICONS.check} color={c.primary} /> : null)}
          />
        );
      })}
    </View>
  );
}

/** Merge-patch editor: add or overwrite one key at a time (the REST surface has no key removal). */
function MetadataPanel({ itemId, metadata }: { itemId: string; metadata: Record<string, unknown> | null }) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const entries = Object.entries(metadata ?? {});

  const save = () => {
    const k = key.trim();
    if (!k) return;
    void mergeItemMetadata(itemId, { [k]: value });
    setKey('');
    setValue('');
  };

  return (
    <View>
      <List.Subheader>Metadata</List.Subheader>
      {entries.map(([k, v]) => (
        <List.Item
          key={k}
          onPress={() => { setKey(k); setValue(typeof v === 'string' ? v : JSON.stringify(v)); }}
          title={typeof v === 'string' ? v : JSON.stringify(v)}
          titleNumberOfLines={1}
          description={k}
        />
      ))}
      <View style={styles.metaEdit}>
        <Input label="key" style={styles.metaKeyInput} autoCapitalize="none" value={key} onChangeText={setKey} />
        <Input label="value" style={styles.metaValueInput} value={value} onChangeText={setValue} />
        <Button title="Set" onPress={save} disabled={!key.trim()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 6 },
  deleted: { fontWeight: '600' },
  h1: { fontSize: 20, fontWeight: '600' },
  when: { fontSize: 14 },
  recur: { fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  description: { fontSize: 14, marginTop: 6 },
  note: { fontSize: 13, marginTop: 4 },
  calDot: { width: 10, height: 10, borderRadius: 5 },
  metaEdit: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 },
  metaKeyInput: { flex: 2 },
  metaValueInput: { flex: 3 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 20 },
});
