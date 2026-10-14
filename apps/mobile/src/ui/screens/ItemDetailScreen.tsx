import { describeRrule } from '@lupira/cal-domain/rrule';
import {
  occurrenceEdit, occurrenceKey, occurrenceScopes, occurrenceView, seriesDeviationRows,
  type OccurrenceEdit, type OccurrenceScope, type SeriesDeviationRow, type SeriesItem,
} from '@lupira/cal-domain/seriesOccurrences';
import { fmtWhen, ymd } from '@danbro96/lupira-domain-core/time';
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
import { coreOfDoc, followingSeriesOf, metadataInputOf, metadataValueFromInput } from '../../domain/editors';
import { copyText } from '@danbro96/lupira-expo-feedback/copy';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import {
  changeOccurrence, deleteFollowing, deleteItem, fileItem, joinItem, mergeItemMetadata, restoreOccurrence, reviseItem, setRsvp, splitItem, unfileItem,
} from '../../state/actions';
import { usePrefs } from '../../state/prefs-store';
import { useContactList } from '../../state/useContactList';
import { useCalendars } from '../../state/useContainers';
import { useItemState } from '../../state/useItemState';
import { useMyContactId } from '../../state/useMe';
import { Centered } from '../components/Centered';
import { ActionMenu } from '@danbro96/lupira-expo-paper/components/ActionMenu';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { PlaceTile } from '../components/PlaceTile';
import { TagRow } from '../components/TagRow';
import { useToastClearance } from '@danbro96/lupira-expo-paper/components/ToastHost';
import { AttendeeChips } from '../event/AttendeeChips';
import { HierarchySection } from '../event/HierarchySection';
import { SCOPE_LABELS } from '../event/scopeLabels';
import { useCalendarColors } from '../hooks/palette';
import { EventPhotosRow } from '../photos/EventPhotosRow';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors } from '../theme';

export function ItemDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'ItemDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { itemId, occurrence } = route.params;
  const { data: state, isLoading } = useItemState(itemId);
  const { data: contacts } = useContactList();
  const debugEnabled = usePrefs((s) => s.debugEnabled);
  const me = useMyContactId();
  const confirm = useConfirm();
  const [actionBarHeight, setActionBarHeight] = useState(0);
  const [menu, setMenu] = useState<'delete' | 'cancel' | 'edit' | null>(null);
  useToastClearance(actionBarHeight + insets.bottom);

  if (isLoading) return <Centered text="Loading…" />;
  if (!state) return <Centered text="This item is not in the offline mirror." />;
  const doc = state.doc;
  const key = occurrence && !Number.isNaN(Date.parse(occurrence)) ? occurrenceKey(occurrence) : null;
  const scopes = occurrenceScopes(doc, key);
  const view = key && scopes.includes('this') ? occurrenceView(doc as SeriesItem, key) : null;
  const title = view ? view.title : doc.title;
  const description = view ? view.description : doc.description;
  const status = view ? view.status : doc.status;

  const start = view ? view.start : doc.isAllDay ? doc.startDate : doc.startsAt;
  const end = view ? view.end : doc.isAllDay ? doc.endDate : doc.endsAt;
  const cancelled = status === 'Cancelled';
  const occurrenceCancelled = view?.change?.status === 'Cancelled';
  const attendees = doc.attendees ?? [];
  const contactName = (id: string) => attendeeName(id, me, (x) => contacts?.find((row) => row.id === x)?.displayName);
  // Only people the mirror has: a contact outside your address books would open to "not in the offline mirror".
  const openContact = (contactId: string) => {
    if (contacts?.some((row) => row.id === contactId)) navigation.navigate('ContactDetail', { contactId });
  };
  const join = me && !attendees.some((a) => a.contactId === me)
    ? () => void joinItem(itemId, me).then(() => toast('You joined this event'))
    : undefined;

  const confirmDelete = async (scope: OccurrenceScope = 'series') => {
    const ok = await confirm({
      title: scope === 'following' ? 'Delete following events' : 'Delete event',
      message: scope === 'following'
        ? `Delete this and every later “${title ?? 'event'}”? It syncs to everyone.`
        : `Delete “${doc.title ?? 'this event'}”${doc.recurrenceRule ? ' and all its events' : ''}? It syncs to everyone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    if (scope === 'following' && key) void deleteFollowing(state, key).then(() => navigation.goBack());
    else void deleteItem(itemId).then(() => navigation.goBack());
  };

  // A deleted or cancelled occurrence is one Revert away, so Undo instead of a confirm.
  const editOccurrence = (edit: OccurrenceEdit, message: string) => {
    if (!key) return;
    const before: OccurrenceEdit = view?.change ? { kind: 'change', change: view.change } : { kind: 'restore' };
    void changeOccurrence(itemId, key, edit).then(() =>
      toast(message, { action: { label: 'Undo', onPress: () => void changeOccurrence(itemId, key, before) } }));
  };

  const deleteIn = (scope: OccurrenceScope) => {
    if (scope !== 'this' || !key) return void confirmDelete(scope);
    editOccurrence({ kind: 'exclude' }, 'Event deleted');
    navigation.goBack();
  };

  const cancelIn = (scope: OccurrenceScope) => {
    const following = scope === 'following' && key ? followingSeriesOf(doc, key) : null;
    if (scope === 'this' && key) editOccurrence(occurrenceEdit(doc as SeriesItem, key, { status: 'Cancelled' }), 'Event cancelled');
    else if (following && key) {
      void splitItem(state, key, { ...coreOfDoc(following), status: 'Cancelled' }).then((id) => {
        toast('Following events cancelled');
        navigation.replace('ItemDetail', { itemId: id, occurrence: key });
      });
    } else setStatus('Cancelled', 'Event cancelled');
  };

  const scoped = (run: (scope: OccurrenceScope) => void, destructive = false) =>
    scopes.map((scope) => ({ label: SCOPE_LABELS[scope], destructive, onPress: () => run(scope) }));
  const menuActions = menu === 'delete' ? scoped(deleteIn, true)
    : menu === 'cancel' ? scoped(cancelIn)
    : scoped((scope) => navigation.navigate('ItemEdit', { itemId, occurrence: key ?? undefined, scope }));
  const withScope = (name: 'delete' | 'cancel' | 'edit', single: () => void) => () => (scopes.length > 1 ? setMenu(name) : single());

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
          {cancelled && <Text style={[styles.flag, { color: c.danger }]}>Cancelled</Text>}
          <Text
            style={[styles.h1, cancelled && styles.struck]}
            onLongPress={title ? () => copyText(title, 'Event name') : undefined}
          >
            {displayTitle(title)}
          </Text>
          {start && (
            <Text style={[styles.when, { color: c.textMuted }]}>
              {fmtWhen(start, doc.isAllDay)}
              {end ? ` → ${fmtWhen(end, doc.isAllDay)}` : ''}
            </Text>
          )}
          <ZoneLine doc={doc} startsAt={view ? view.start : doc.startsAt} endsAt={view ? view.end : doc.endsAt} />
          {doc.recurrenceRule && <Text style={[styles.recur, { color: c.primary }]}>{describeRrule(doc.recurrenceRule)}</Text>}
          {view && (view.change || view.excluded) && (
            <View style={styles.changed}>
              <Text style={[styles.note, styles.changedText, { color: c.textMuted }]}>
                {view.excluded ? 'Deleted from the series' : 'Changed from the series'}
              </Text>
              <Button title="Revert" variant="text" onPress={() => void restoreOccurrence(itemId, view.originalStart)} />
            </View>
          )}
        </View>
        {(doc.placeId || doc.locationLabel) && (
          <PlaceTile placeId={doc.placeId} label={doc.locationLabel} meta={doc.placeId ? null : 'Needs a place'} />
        )}
        <View style={styles.inset}>
          {((status && !cancelled) || doc.category) && (
            <View style={styles.chipRow}>
              {status && !cancelled && <Chip compact mode="outlined">{status}</Chip>}
              {doc.category && <Chip compact mode="outlined">{doc.category}</Chip>}
            </View>
          )}
          {description ? (
            <Text style={styles.description} onLongPress={() => copyText(description, 'Description')}>{description}</Text>
          ) : null}
          {doc.prompt != null && <Text style={[styles.note, { color: c.textMuted }]}>Has a prompt payload (view on web)</Text>}
          {doc.action != null && <Text style={[styles.note, { color: c.textMuted }]}>Has an action payload (view on web)</Text>}

          {(attendees.length > 0 || join) && (
          <AttendeeChips
            attendees={attendees}
            nameOf={contactName}
            onJoin={join}
            onOpen={openContact}
            onRespond={(contactId, status) => void setRsvp(itemId, contactId, status)}
          />
        )}

          <CalendarsPanel itemId={itemId} memberships={doc.calendars} />
          <Button
            title="Add task"
            variant="text"
            style={styles.addTask}
            onPress={() => navigation.navigate('TaskCreate', { event: { id: itemId, title: displayTitle(doc.title), day: eventDay(doc) } })}
          />
        </View>
        <ChangedOccurrences
          doc={doc}
          onOpen={(originalStart) => navigation.push('ItemDetail', { itemId, occurrence: originalStart })}
          onRevert={(originalStart) => void restoreOccurrence(itemId, originalStart)}
        />
        <HierarchySection
          itemId={itemId}
          parentId={doc.parentItemId ?? null}
          onOpen={(id) => navigation.push('ItemDetail', { itemId: id })}
        />
        <EventPhotosRow itemId={itemId} item={doc} />
        <TagRow tags={doc.tags} />
        <MetadataPanel itemId={itemId} metadata={doc.metadata ?? null} editable={debugEnabled} />
      </ScrollView>

      {/* Pinned; the navigator's bottom padding keeps it above the system navigation bar. Primary action rightmost. */}
      <View
        style={[styles.actionBar, { backgroundColor: c.bg, borderTopColor: c.divider, paddingBottom: spacing.sm }]}
        onLayout={(e) => setActionBarHeight(e.nativeEvent.layout.height)}
      >
        <Button title="Delete" variant="destructive" onPress={withScope('delete', () => void confirmDelete())} />
        {occurrenceCancelled
          ? <Button title="Restore" variant="secondary" onPress={() => editOccurrence(occurrenceEdit(doc as SeriesItem, key!, { status: null }), 'Event restored')} />
          : cancelled
            ? <Button title="Restore" variant="secondary" onPress={() => setStatus('Confirmed', 'Event restored')} />
            : <Button title="Cancel event" variant="secondary" onPress={withScope('cancel', () => setStatus('Cancelled', 'Event cancelled'))} />}
        <Button title="Edit" style={styles.primary} onPress={withScope('edit', () => navigation.navigate('ItemEdit', { itemId }))} />
      </View>
      <ActionMenu
        visible={menu !== null}
        title={menu === 'delete' ? 'Delete which events?' : menu === 'cancel' ? 'Cancel which events?' : 'Edit which events?'}
        actions={menuActions}
        onClose={() => setMenu(null)}
      />
    </View>
  );
}

const DEVIATION_LABELS: Record<SeriesDeviationRow['kind'], string> = { excluded: 'Deleted', cancelled: 'Cancelled', changed: 'Changed' };

function deviationDetail(d: SeriesDeviationRow, allDay: boolean): string | undefined {
  const moved = d.change?.startsAt ? `→ ${fmtWhen(d.change.startsAt, allDay)}` : null;
  return [moved, d.change?.title].filter(Boolean).join(' · ') || undefined;
}

/** A series' deleted, cancelled and changed occurrences, each one tap from its own view and one from the series. */
function ChangedOccurrences({ doc, onOpen, onRevert }: {
  doc: ItemDoc;
  onOpen: (originalStart: string) => void;
  onRevert: (originalStart: string) => void;
}) {
  const rows = doc.recurrenceRule ? seriesDeviationRows(doc) : [];
  if (rows.length === 0) return null;
  return (
    <View>
      <List.Subheader>Changed occurrences</List.Subheader>
      {rows.map((d) => (
        <List.Item
          key={d.originalStart}
          style={styles.dense}
          title={`${fmtWhen(d.originalStart, doc.isAllDay)} · ${DEVIATION_LABELS[d.kind]}`}
          description={deviationDetail(d, doc.isAllDay)}
          onPress={() => onOpen(d.originalStart)}
          right={() => <Button title="Revert" variant="text" onPress={() => onRevert(d.originalStart)} />}
        />
      ))}
    </View>
  );
}

function eventDay(doc: ItemDoc): string | null {
  if (doc.isAllDay) return doc.startDate ?? null;
  return doc.startsAt ? ymd(new Date(doc.startsAt)) : null;
}

/** Only when the event keeps another zone's clock: what the time reads there. */
function ZoneLine({ doc, startsAt, endsAt }: { doc: ItemDoc; startsAt?: string | null; endsAt?: string | null }) {
  const c = useColors();
  const zone = doc.startTimezone;
  if (doc.isAllDay || !startsAt || !isValidTimeZone(zone) || zone === deviceTimeZone()) return null;
  const from = instantToWall(startsAt, zone).time;
  const to = endsAt ? `–${instantToWall(endsAt, zone).time}` : '';
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
          <TextField label="key" style={[fieldGap, styles.metaKeyInput]} autoCapitalize="none" value={key} onChangeText={setKey} />
          <TextField label="value" style={[fieldGap, styles.metaValueInput]} value={value} onChangeText={setValue} />
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
  changed: { flexDirection: 'row', alignItems: 'center' },
  changedText: { flex: 1 },
  proposalText: { flex: 1, fontSize: 14 },
  metaEdit: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 },
  metaKeyInput: { flex: 2 },
  metaValueInput: { flex: 3 },
  actionBar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  primary: { flex: 1 },
  addTask: { alignSelf: 'flex-start' },
});
