import { describeRrule } from '@lupira/cal-domain/rrule';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { deviceTimeZone, instantToWall, isValidTimeZone, zoneCity } from '@lupira/cal-domain/zonedTime';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, HelperText, List, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calendarLabel } from '@lupira/cal-domain/calendars';
import { attendeeName } from '@danbro96/lupira-domain-contacts/contactNames';
import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import type { CalendarMembership, ItemDoc } from '../../domain/docTypes';
import { coreOfDoc, metadataInputOf, metadataValueFromInput } from '../../domain/editors';
import { copyText } from '@danbro96/lupira-expo-feedback/copy';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import { deleteItem, fileItem, joinItem, mergeItemMetadata, reviseItem, unfileItem } from '../../state/actions';
import { usePrefs } from '../../state/prefs-store';
import { useContactList } from '../../state/useContactList';
import { useCalendars } from '../../state/useContainers';
import { useItemState } from '../../state/useItemState';
import { useMyContactId } from '../../state/useMe';
import { Centered } from '../components/Centered';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { Input } from '../components/Input';
import { PlaceTile } from '../components/PlaceTile';
import { TagRow } from '../components/TagRow';
import { useToastClearance } from '@danbro96/lupira-expo-paper/components/ToastHost';
import { AttendeeChips } from '../event/AttendeeChips';
import { useCalendarColors } from '../hooks/palette';
import { EventPhotosRow } from '../photos/EventPhotosRow';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors } from '../theme';

export function ItemDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'ItemDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { itemId } = route.params;
  const { data: state, isLoading } = useItemState(itemId);
  const { data: contacts } = useContactList();
  const debugEnabled = usePrefs((s) => s.debugEnabled);
  const me = useMyContactId();
  const confirm = useConfirm();
  const [actionBarHeight, setActionBarHeight] = useState(0);
  useToastClearance(actionBarHeight);

  if (isLoading) return <Centered text="Loading…" />;
  if (!state) return <Centered text="This item is not in the offline mirror." />;
  const doc = state.doc;

  const start = doc.isAllDay ? doc.startDate : doc.startsAt;
  const end = doc.isAllDay ? doc.endDate : doc.endsAt;
  const cancelled = doc.status === 'Cancelled';
  const attendees = doc.attendees ?? [];
  const contactName = (id: string) => attendeeName(id, me, (x) => contacts?.find((row) => row.id === x)?.displayName);
  // Only people the mirror has: a contact outside your address books would open to "not in the offline mirror".
  const openContact = (contactId: string) => {
    if (contacts?.some((row) => row.id === contactId)) navigation.navigate('ContactDetail', { contactId });
  };
  const join = me && !state.deleted && !attendees.some((a) => a.contactId === me)
    ? () => void joinItem(itemId, me).then(() => toast('You joined this event'))
    : undefined;

  const confirmDelete = async () => {
    const ok = await confirm({
      title: 'Delete event',
      message: `Delete “${doc.title ?? 'this event'}”? It syncs to everyone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) void deleteItem(itemId).then(() => navigation.goBack());
  };

  // Cancelling keeps the event (attendees see it cancelled); Undo instead of a confirm, since it's reversible.
  // The REST contract can't clear a status, so undoing on a never-set one lands on Confirmed.
  const setStatus = (status: string, message: string) => {
    const before = coreOfDoc(doc);
    void reviseItem(itemId, { ...before, status }).then(() =>
      toast(message, {
        action: { label: 'Undo', onPress: () => void reviseItem(itemId, { ...before, status: before.status ?? 'Confirmed' }) },
      }));
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <View style={styles.inset}>
          {state.deleted && <Text style={[styles.flag, { color: c.danger }]}>Deleted — pending sync</Text>}
          {cancelled && <Text style={[styles.flag, { color: c.danger }]}>Cancelled</Text>}
          <Text
            style={[styles.h1, cancelled && styles.struck]}
            onLongPress={doc.title ? () => copyText(doc.title!, 'Event name') : undefined}
          >
            {displayTitle(doc.title)}
          </Text>
          {start && (
            <Text style={[styles.when, { color: c.textMuted }]}>
              {fmtWhen(start, doc.isAllDay)}
              {end ? ` → ${fmtWhen(end, doc.isAllDay)}` : ''}
            </Text>
          )}
          <ZoneLine doc={doc} />
          {doc.recurrenceRule && <Text style={[styles.recur, { color: c.primary }]}>{describeRrule(doc.recurrenceRule)}</Text>}
        </View>
        {(doc.placeId || doc.locationLabel) && <PlaceTile placeId={doc.placeId} label={doc.locationLabel} />}
        <View style={styles.inset}>
          {((doc.status && !cancelled) || doc.category) && (
            <View style={styles.chipRow}>
              {doc.status && !cancelled && <Chip compact mode="outlined">{doc.status}</Chip>}
              {doc.category && <Chip compact mode="outlined">{doc.category}</Chip>}
            </View>
          )}
          {doc.description ? (
            <Text style={styles.description} onLongPress={() => copyText(doc.description!, 'Description')}>{doc.description}</Text>
          ) : null}
          {doc.prompt != null && <Text style={[styles.note, { color: c.textMuted }]}>Has a prompt payload (view on web)</Text>}
          {doc.action != null && <Text style={[styles.note, { color: c.textMuted }]}>Has an action payload (view on web)</Text>}

          {(attendees.length > 0 || join) && (
          <AttendeeChips attendees={attendees} nameOf={contactName} onJoin={join} onOpen={openContact} />
        )}

          <CalendarsPanel itemId={itemId} memberships={doc.calendars} />
        </View>
        <EventPhotosRow itemId={itemId} item={doc} />
        <TagRow tags={doc.tags} />
        <MetadataPanel itemId={itemId} metadata={doc.metadata ?? null} editable={debugEnabled} />
      </ScrollView>

      {/* Pinned above the system navigation bar (edge-to-edge: nothing else pads it); primary action rightmost. */}
      <View
        style={[styles.actionBar, { backgroundColor: c.bg, borderTopColor: c.divider, paddingBottom: insets.bottom + spacing.sm }]}
        onLayout={(e) => setActionBarHeight(e.nativeEvent.layout.height)}
      >
        <Button title="Delete" variant="destructive" onPress={() => void confirmDelete()} />
        {cancelled
          ? <Button title="Restore" variant="secondary" onPress={() => setStatus('Confirmed', 'Event restored')} />
          : <Button title="Cancel event" variant="secondary" onPress={() => setStatus('Cancelled', 'Event cancelled')} />}
        <Button title="Edit" style={styles.primary} onPress={() => navigation.navigate('ItemEdit', { itemId })} />
      </View>
    </View>
  );
}

/** Only when the event keeps another zone's clock: what the time reads there. */
function ZoneLine({ doc }: { doc: ItemDoc }) {
  const c = useColors();
  const zone = doc.startTimezone;
  if (doc.isAllDay || !doc.startsAt || !isValidTimeZone(zone) || zone === deviceTimeZone()) return null;
  const from = instantToWall(doc.startsAt, zone).time;
  const to = doc.endsAt ? `–${instantToWall(doc.endsAt, zone).time}` : '';
  return <Text style={[styles.when, { color: c.textMuted }]}>{`${from}${to} in ${zoneCity(zone)}`}</Text>;
}

/** Read-only filing (the editor moves an event); a proposal is answered here, where it's seen. */
function CalendarsPanel({ itemId, memberships }: { itemId: string; memberships: CalendarMembership[] }) {
  const c = useColors();
  const { data: calendars } = useCalendars();
  const colorOf = useCalendarColors();
  const nameOf = (id: string) => {
    const cal = calendars?.find((x) => x.id === id);
    return cal ? calendarLabel(cal) : id;
  };
  const accepted = memberships.filter((m) => m.status === 'Accepted');
  const proposed = memberships.filter((m) => m.status === 'Proposed');

  return (
    <View>
      <Text variant="labelMedium" style={[styles.sectionLabel, { color: c.textMuted }]}>Calendars</Text>
      <View style={styles.chipRow}>
        {accepted.map((m) => (
          <Chip key={m.calendarId} compact icon={() => <View style={[styles.calDot, { backgroundColor: colorOf(m.calendarId) }]} />}>
            {nameOf(m.calendarId)}
          </Chip>
        ))}
      </View>
      {proposed.map((m) => (
        <View key={m.calendarId} style={styles.proposal}>
          <View style={[styles.calDot, { backgroundColor: colorOf(m.calendarId) }]} />
          <Text style={[styles.proposalText, { color: c.text }]}>Proposed for {nameOf(m.calendarId)}</Text>
          <Button title="Accept" variant="text" onPress={() => void fileItem(itemId, m.calendarId, 'accepted')} />
          <Button title="Dismiss" variant="text" onPress={() => void unfileItem(itemId, m.calendarId)} />
        </View>
      ))}
    </View>
  );
}

/** Mostly written by importers and agents, so it stays folded and read-only; the debug setting unlocks the
 *  merge-patch editor (add or overwrite one key — the REST surface has no key removal). */
function MetadataPanel({ itemId, metadata, editable }: {
  itemId: string;
  metadata: Record<string, unknown> | null;
  editable: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const entries = Object.entries(metadata ?? {});
  if (entries.length === 0 && !editable) return null;

  const save = () => {
    const k = key.trim();
    if (!k) return;
    const r = metadataValueFromInput(value, metadata?.[k]);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    void mergeItemMetadata(itemId, { [k]: r.value });
    setKey('');
    setValue('');
  };

  return (
    <List.Accordion
      title={`Metadata (${entries.length})`}
      style={styles.dense}
      expanded={expanded}
      onPress={() => setExpanded((e) => !e)}
    >
      {entries.map(([k, v]) => (
        <List.Item
          key={k}
          onPress={editable ? () => { setKey(k); setValue(metadataInputOf(v)); } : undefined}
          title={metadataInputOf(v)}
          titleNumberOfLines={2}
          description={k}
          style={styles.dense}
        />
      ))}
      {editable && (
        <View style={[styles.inset, styles.metaEdit]}>
          <Input label="key" style={styles.metaKeyInput} autoCapitalize="none" value={key} onChangeText={setKey} />
          <Input label="value" style={styles.metaValueInput} value={value} onChangeText={setValue} />
          <Button title="Set" onPress={save} disabled={!key.trim()} />
        </View>
      )}
      {!!error && <HelperText type="error">{error}</HelperText>}
    </List.Accordion>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { paddingVertical: spacing.md, gap: spacing.xs },
  inset: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  dense: { paddingVertical: 0 },
  sectionLabel: { marginTop: spacing.sm, marginBottom: spacing.xs },
  flag: { fontWeight: '600' },
  h1: { fontSize: 20, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through' },
  when: { fontSize: 14 },
  recur: { fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  description: { fontSize: 14 },
  note: { fontSize: 13 },
  calDot: { width: 10, height: 10, borderRadius: 5 },
  proposal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proposalText: { flex: 1, fontSize: 14 },
  metaEdit: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 },
  metaKeyInput: { flex: 2 },
  metaValueInput: { flex: 3 },
  actionBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  primary: { flex: 1 },
});
