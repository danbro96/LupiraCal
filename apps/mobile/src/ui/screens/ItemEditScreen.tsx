import { describeRrule, NO_REPEAT } from '@lupira/cal-domain/rrule';
import {
  allDayKey, followingSeriesOf, occurrenceEdit, occurrenceKey, occurrenceScopes, type OccurrenceScope, type SeriesItem,
} from '@lupira/cal-domain/seriesOccurrences';
import { deviceTimeZone, wallToInstant } from '@lupira/cal-domain/zonedTime';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLayoutEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, List, Switch, Text } from 'react-native-paper';
import { calendarLabel, defaultCalendarIds } from '@lupira/cal-domain/calendars';
import { attendeeName } from '@danbro96/lupira-domain-contacts/contactNames';
import { NO_ATTENDEES } from '@lupira/cal-domain/participation';
import {
  categoryAllDayDefault, emptyItemForm, withAllDay, withCategoryAllDay, withSchedule, type ItemForm, type ScheduleField,
} from '@lupira/cal-domain/itemForm';
import {
  acceptedCalendarIds, attendeeChanges, filingChanges, itemCoreFromForm, itemFormFromDoc, itemFormFromDraft,
  itemFormFromOccurrence, occurrencePatchFromForm, unresolvedLabelOf,
} from '../../domain/editors';
import { itemDraftFromLink } from '../../domain/drafts';
import type { ItemDoc, ParticipantReminder } from '../../domain/docTypes';
import { reminderLabel, sameReminder } from '../../domain/notificationPrefs';
import type { ItemCore } from '../../domain/ops';
import { changeOccurrence, saveItem, splitItem, type ItemSave } from '../../state/actions';
import { usePrefs } from '../../state/prefs-store';
import { useContactList } from '../../state/useContactList';
import { selectableCalendars, useCalendars } from '../../state/useContainers';
import { useItemState } from '../../state/useItemState';
import { useMyContactId } from '../../state/useMe';
import { useEventPlaceContext } from '../../state/usePlacePredictions';
import { DateField } from '../components/DateField';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { TimeField } from '../components/TimeField';
import { CalendarsSheet } from '../event/CalendarsSheet';
import { CategorySheet, categoryIcon } from '../event/CategorySheet';
import { ColorSheet } from '../event/ColorSheet';
import { PeopleSheet } from '../event/PeopleSheet';
import { ReminderSheet } from '../event/ReminderSheet';
import { RepeatSheet } from '../event/RepeatSheet';
import { TimeZoneSheet, zoneSummary } from '../event/TimeZoneSheet';
import { useCalendarColors } from '../hooks/palette';
import { ICONS } from '../icons';
import type { PickedPlace, RootStackParamList } from '../navigation/types';
import { PlaceChipsRow } from '../places/PlaceChipsRow';
import { PlaceSearchSheet } from '../places/PlaceSearchSheet';
import { leaveScreen } from '../navigation/leaveScreen';
import { useUnsavedGuard } from '../navigation/useUnsavedGuard';
import { spacing, useColors } from '../theme';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { detach } from '@danbro96/lupira-expo-diagnostics/log';

type SheetName = 'calendars' | 'category' | 'color' | 'repeat' | 'zone' | 'place' | 'people' | 'reminder';

/** Title, when, where and notes up front; everything used rarely is one row each under More, opening a sheet. A
 *  series' occurrence edits as "this event" (its own times, title, notes, status) or "this and following" (a new series). */
export function ItemEditScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'ItemEdit'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const itemId = route.params?.itemId;
  const { data: state } = useItemState(itemId ?? '');
  const occurrence = route.params?.occurrence;
  const key = occurrence && !Number.isNaN(Date.parse(occurrence)) ? occurrenceKey(occurrence) : null;
  const following = state && key && route.params?.scope === 'following' ? followingSeriesOf(state.doc, key) : null;
  const liveScope: OccurrenceScope = state && key && route.params?.scope && occurrenceScopes(state.doc, key).includes(route.params.scope)
    && (route.params.scope !== 'following' || following) ? route.params.scope : 'series';
  const [pinnedScope, setPinnedScope] = useState<OccurrenceScope | null>(null);
  const scope = pinnedScope ?? liveScope;
  const base = following ?? state?.doc;
  const continued = useRef<{ itemId: string; occurrence: string } | null>(null);
  const { data: calendars } = useCalendars();
  const colorOf = useCalendarColors();
  const { data: contacts } = useContactList();
  const pickable = selectableCalendars(calendars);
  const draft = itemId ? null : (route.params?.draft ?? itemDraftFromLink(route.params ?? {}));

  const [openedForm] = useState<ItemForm>(() => (draft ? itemFormFromDraft(draft) : emptyItemForm(route.params?.day, route.params?.time)));
  const [form, setForm] = useState(openedForm);
  const [calendarIds, setCalendarIds] = useState<string[]>([]);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(!itemId);
  const [labelRemoved, setLabelRemoved] = useState(false);
  const unresolvedLabel = labelRemoved ? null : unresolvedLabelOf(state?.doc, draft);

  /** Pristine snapshots; the exit guard and the header's Save state key off differences from them. A draft
   *  is unsaved work from the start. */
  const [baseline, setBaseline] = useState(() => ({ form: draft ? '' : JSON.stringify(form), calendars: '[]', people: '[]' }));

  if (!seeded && itemId && state) {
    const seededForm = scope === 'this' && key ? itemFormFromOccurrence(state.doc, key) : itemFormFromDoc(base ?? state.doc);
    const seededCalendars = acceptedCalendarIds(state.doc.calendars);
    const seededPeople = (state.doc.attendees ?? []).map((a) => a.contactId);
    setForm(seededForm);
    setCalendarIds(seededCalendars);
    setAttendeeIds(seededPeople);
    setBaseline({
      form: JSON.stringify(seededForm), calendars: JSON.stringify(seededCalendars), people: JSON.stringify(seededPeople),
    });
    setPinnedScope(liveScope);
    setSeeded(true);
  }
  // A new event has you on it, already accepted; taking yourself off is the opt-out.
  const me = useMyContactId();
  const [meSeeded, setMeSeeded] = useState(false);
  if (!itemId && me && !meSeeded) {
    setMeSeeded(true);
    setAttendeeIds((ids) => (ids.includes(me) ? ids : [me, ...ids]));
    setBaseline((b) => ({ ...b, people: JSON.stringify([me]) }));
  }

  // Undefined = untouched; picking one on an event you're not on puts you on it as going.
  const [reminder, setReminder] = useState<ParticipantReminder | undefined>();
  const savedReminder = (state?.doc.attendees ?? []).find((a) => a.contactId === me)?.reminder ?? null;
  const shownReminder = reminder ?? savedReminder;
  const reminderChanged = reminder !== undefined && !sameReminder(reminder, savedReminder);
  const pickReminder = (r: ParticipantReminder) => {
    setReminder(r);
    if (me && r.mode !== 'Default') setAttendeeIds((ids) => (ids.includes(me) ? ids : [me, ...ids]));
  };
  const notify = usePrefs((p) => p.notify);

  const prefsLoaded = usePrefs((p) => p.loaded);
  const lastCalendarIds = usePrefs((p) => p.lastCalendarIds);
  const initialCalendarIds = !itemId && calendarIds.length === 0 && prefsLoaded
    ? defaultCalendarIds(selectableCalendars(calendars), lastCalendarIds)
    : [];
  if (initialCalendarIds.length > 0) {
    setCalendarIds(initialCalendarIds);
    setBaseline((b) => ({ ...b, calendars: JSON.stringify(initialCalendarIds) }));
  }

  const placeContext = useEventPlaceContext({ category: form.category, attendeeIds, day: form.startDay || null });
  const [appliedPick, setAppliedPick] = useState<PickedPlace | undefined>();
  const picked = route.params?.pickedPlace;
  if (picked && picked !== appliedPick) {
    setAppliedPick(picked);
    setForm((f) => ({ ...f, place: picked.selection }));
  }

  const dirty = JSON.stringify(form) !== baseline.form
    || JSON.stringify(calendarIds) !== baseline.calendars
    || JSON.stringify(attendeeIds) !== baseline.people
    || reminderChanged
    || labelRemoved;

  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setSchedule = (field: ScheduleField, value: string) => {
    setScheduleTouched(true);
    setForm((f) => withSchedule(f, field, value));
  };
  const clearEnd = () => {
    setScheduleTouched(true);
    setForm((f) => ({ ...f, endDay: '', endTime: '' }));
  };
  const toggleAllDay = (on: boolean) => {
    setScheduleTouched(true);
    setForm((f) => withAllDay(f, on));
  };
  // Category picked first on a NEW event steers the schedule shape — but never overrides user input.
  const pickCategory = (category: string) => {
    setForm((f) => {
      const next = { ...f, category };
      const allDay = itemId || scheduleTouched ? null : categoryAllDayDefault(category);
      return allDay === null ? next : withCategoryAllDay(next, allDay, openedForm);
    });
  };

  /** Persists without navigating; false = validation failed, so the guard keeps the user here. */
  const stale = () => {
    setError('This series changed while you were editing — reopen it');
    return false;
  };
  const submit = async (): Promise<boolean> => {
    if (scope === 'this' && key) return state ? saveOccurrence(state.doc, key) : stale();
    const r = itemCoreFromForm(form, base, unresolvedLabel);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    if (!itemId && !form.title.trim()) {
      setError('A new event needs a title');
      return false;
    }
    if (calendarIds.length === 0) {
      setError('Pick a calendar');
      return false;
    }
    setError(null);
    if (scope === 'following' && itemId && key) {
      const core = r.value;
      const first = core.isAllDay ? (core.startDate ? allDayKey(core.startDate) : key) : (core.startsAt ? occurrenceKey(core.startsAt) : key);
      const outcome = await splitItem(itemId, key, core);
      if (outcome.kind === 'stale') return stale();
      continued.current = { itemId: outcome.itemId, occurrence: first };
      return true;
    }
    const ownReminder = me && reminderChanged && reminder ? { contactId: me, reminder } : undefined;
    return persistItem(itemId, r.value, state?.doc, calendarIds, attendeeIds, me, ownReminder, setError);
  };
  const saveOccurrence = async (doc: ItemDoc, originalStart: string): Promise<boolean> => {
    const r = occurrencePatchFromForm(form, doc);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    setError(null);
    return await changeOccurrence(doc.id, originalStart, occurrenceEdit(doc as SeriesItem, originalStart, r.value)) || stale();
  };
  const guard = useUnsavedGuard(dirty, {
    message: 'Save this event before leaving?',
    onSave: submit,
  });

  const saveAndLeave = () => {
    submit().then((saved) => {
      if (!saved) return;
      guard.leave();
      if (continued.current) navigation.popTo('ItemDetail', continued.current);
      else leaveScreen(navigation);
    }).catch(() => toastError('Could not save the event.'));
  };

  // Save lives in the header (dimmed until something changes); leaving unsaved is guarded, so there
  // is no Cancel button. Dependency-free on purpose: saveAndLeave closes over live form state.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button mode="text" compact disabled={!dirty} onPress={saveAndLeave}>
          Save
        </Button>
      ),
    });
  });

  if (itemId && !seeded) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.muted, { color: c.textMuted }]}>Loading…</Text>
      </View>
    );
  }

  const calendarName = (id: string) => {
    const cal = calendars?.find((x) => x.id === id);
    return cal ? calendarLabel(cal) : id;
  };
  const contactName = (id: string) => attendeeName(id, me, (x) => contacts?.find((row) => row.id === x)?.displayName);
  const people = attendeeIds.length === 0
    ? NO_ATTENDEES
    : attendeeIds.slice(0, 2).map(contactName).join(', ') + (attendeeIds.length > 2 ? ` +${attendeeIds.length - 2}` : '');
  const cancelled = form.status === 'Cancelled';
  const noEnd = form.isAllDay ? 'Same day' : 'No end';
  const otherZone = !form.isAllDay && !!form.timeZone && form.timeZone !== deviceTimeZone();
  const zoneAt = form.timeZone && form.startDay && form.startTime ? wallToInstant(form.startDay, form.startTime, form.timeZone) : undefined;
  const placeHint = !form.place ? unresolvedLabel : null;
  const defaultMinutes = notify.defaultReminder && !form.isAllDay ? notify.defaultMinutes : null;
  const seriesFields = scope !== 'this';
  const sharedFields = scope === 'series';
  const banded = calendarIds.some((id) => calendars?.find((x) => x.id === id)?.kind === 'Availability');

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        {cancelled && (
          <Text style={[styles.notice, { color: c.danger }]}>This event is cancelled — restore it from the event screen.</Text>
        )}
        {scope !== 'series' && (
          <Text style={[styles.muted, { color: c.textMuted }]}>
            {scope === 'this' ? 'Changes only this event' : 'Changes this and every later event'}
          </Text>
        )}
        <TextField label="Title" autoFocus={!itemId} style={[fieldGap, styles.title]} value={form.title} onChangeText={(v) => set('title', v)} />

        {seriesFields && (
          <List.Item
            title="All-day"
            style={styles.row}
            left={(p) => <List.Icon {...p} icon={ICONS.schedule} />}
            right={() => <Switch value={form.isAllDay} onValueChange={toggleAllDay} />}
          />
        )}
        <View style={styles.whenRow}>
          <Text style={[styles.whenLabel, { color: c.textMuted }]}>Starts</Text>
          <View style={styles.day}>
            <DateField weekday clearable={false} value={form.startDay} onChange={(v) => setSchedule('startDay', v)} />
          </View>
          {!form.isAllDay && (
            <View style={styles.time}>
              <TimeField clearable={false} value={form.startTime} onChange={(v) => setSchedule('startTime', v)} />
            </View>
          )}
        </View>
        <View style={styles.whenRow}>
          <Text style={[styles.whenLabel, { color: c.textMuted }]}>Ends</Text>
          <View style={styles.day}>
            <DateField
              weekday
              clearable={false}
              placeholder={noEnd}
              nullLabel={noEnd}
              value={form.endDay}
              initial={form.startDay}
              onChange={(v) => (v ? setSchedule('endDay', v) : clearEnd())}
            />
          </View>
          {/* An endless event is one "No end" button; picking its date fills in the time. */}
          {!form.isAllDay && !!form.endDay && (
            <View style={styles.time}>
              <TimeField
                clearable={false}
                nullLabel={noEnd}
                value={form.endTime}
                onChange={(v) => (v ? setSchedule('endTime', v) : clearEnd())}
              />
            </View>
          )}
        </View>
        {otherZone && <Text style={[styles.muted, styles.zoneNote, { color: c.textMuted }]}>Times in {zoneSummary(form.timeZone, zoneAt)}</Text>}

        {seriesFields && (
          <PlaceChipsRow ctx={placeContext} value={form.place} onChange={(p) => set('place', p)} onMore={() => setSheet('place')} />
        )}
        {seriesFields && !!placeHint && (
          <View style={styles.hint}>
            <Text style={[styles.muted, styles.hintText, { color: c.warning }]} numberOfLines={2} onPress={() => setSheet('place')}>
              Needs a place: “{placeHint}”
            </Text>
            <Button mode="text" compact onPress={() => setLabelRemoved(true)}>Remove</Button>
          </View>
        )}
        <TextField
          label="Description"
          multiline
          numberOfLines={3}
          style={[fieldGap, styles.description]}
          value={form.description}
          onChangeText={(v) => set('description', v)}
        />

        {seriesFields && <List.Subheader style={styles.subheader}>More</List.Subheader>}
        {sharedFields && pickable.length > 1 && (
          <MoreRow icon={ICONS.calendar} title="Calendars" value={calendarIds.map(calendarName).join(', ')} onPress={() => setSheet('calendars')} />
        )}
        {seriesFields && (
          <MoreRow
            icon={form.category ? categoryIcon(form.category) : ICONS.event}
            title="Category"
            value={form.category || 'None'}
            onPress={() => setSheet('category')}
          />
        )}
        {seriesFields && !banded && (
          <MoreRow icon={ICONS.palette} title="Colour" value={form.color || 'Calendar colour'} onPress={() => setSheet('color')} />
        )}
        {seriesFields && (
          <MoreRow
            icon={ICONS.repeat}
            title="Repeats"
            value={form.recurrenceRule ? describeRrule(form.recurrenceRule) : NO_REPEAT}
            onPress={() => setSheet('repeat')}
          />
        )}
        {sharedFields && <MoreRow icon={ICONS.group} title="People" value={people} onPress={() => setSheet('people')} />}
        {sharedFields && !!me && (
          <MoreRow icon={ICONS.alarm} title="Reminder" value={reminderLabel(shownReminder, defaultMinutes)} onPress={() => setSheet('reminder')} />
        )}
        {seriesFields && !form.isAllDay && !!form.timeZone && (
          <MoreRow icon={ICONS.public} title="Time zone" value={zoneSummary(form.timeZone, zoneAt)} onPress={() => setSheet('zone')} />
        )}
        {!cancelled && (
          <List.Item
            title="Tentative"
            description="Not confirmed yet"
            left={(p) => <List.Icon {...p} icon={ICONS.help} />}
            right={() => (
              <Switch value={form.status === 'Tentative'} onValueChange={(on) => set('status', on ? 'Tentative' : 'Confirmed')} />
            )}
          />
        )}
        {seriesFields && (
          <TextField style={fieldGap} label="Tags (comma-separated)" autoCapitalize="none" value={form.tagsCsv} onChangeText={(v) => set('tagsCsv', v)} />
        )}

        <HelperText type="error" visible={!!error}>{error}</HelperText>
      </ScrollView>

      {sheet === 'calendars' && (
        <CalendarsSheet
          calendars={pickable}
          memberships={state?.doc.calendars ?? []}
          selected={calendarIds}
          onChange={setCalendarIds}
          onDismiss={() => setSheet(null)}
        />
      )}
      {sheet === 'category' && <CategorySheet value={form.category} onPick={pickCategory} onDismiss={() => setSheet(null)} />}
      {sheet === 'color' && (
        <ColorSheet
          value={form.color}
          calendarFill={colorOf(calendarIds[0] ?? null)}
          onPick={(v) => set('color', v)}
          onDismiss={() => setSheet(null)}
        />
      )}
      {sheet === 'repeat' && (
        <RepeatSheet value={form.recurrenceRule} onPick={(v) => set('recurrenceRule', v)} onDismiss={() => setSheet(null)} />
      )}
      {sheet === 'zone' && <TimeZoneSheet value={form.timeZone} at={zoneAt} onPick={(v) => set('timeZone', v)} onDismiss={() => setSheet(null)} />}
      {sheet === 'place' && (
        <PlaceSearchSheet
          ctx={placeContext}
          seed={placeHint ?? undefined}
          hasPlace={!!form.place}
          onPick={(p) => set('place', p)}
          onPickOnMap={(start) => navigation.navigate('PinPlace', { origin: 'ItemEdit', start, nameRequired: true })}
          onDismiss={() => setSheet(null)}
        />
      )}
      {sheet === 'reminder' && (
        <ReminderSheet value={shownReminder} defaultMinutes={defaultMinutes} onPick={pickReminder} onDismiss={() => setSheet(null)} />
      )}
      {sheet === 'people' && (
        <PeopleSheet
          selected={attendeeIds}
          me={me}
          onChange={setAttendeeIds}
          onDismiss={() => setSheet(null)}
        />
      )}
    </>
  );
}

function MoreRow({ icon, title, value, onPress }: { icon: string; title: string; value: string; onPress: () => void }) {
  return (
    <List.Item
      title={title}
      description={value}
      descriptionNumberOfLines={1}
      left={(p) => <List.Icon {...p} icon={icon} />}
      right={(p) => <List.Icon {...p} icon={ICONS.chevronRight} />}
      onPress={onPress}
    />
  );
}

async function persistItem(
  itemId: string | undefined,
  core: ItemCore,
  doc: ItemDoc | undefined,
  calendarIds: string[],
  attendeeIds: string[],
  me: string | null,
  reminder: ItemSave['reminder'],
  setError: (error: string | null) => void,
): Promise<boolean> {
  const filing = filingChanges(doc?.calendars ?? [], calendarIds);
  const attendees = attendeeChanges(doc?.attendees ?? [], attendeeIds);
  try {
    await saveItem(itemId, { core, ...filing, ...attendees, accept: me ? [me] : [], reminder });
    if (!itemId) detach(usePrefs.getState().setLastCalendarIds(calendarIds), 'prefs:lastCalendars');
    return true;
  } catch (e) {
    setError(String(e));
    return false;
  }
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 13 },
  notice: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 18 },
  row: { paddingHorizontal: 0 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  whenLabel: { width: 48, fontSize: 13 },
  day: { flex: 3 },
  time: { flex: 2 },
  zoneNote: { marginTop: 4, marginLeft: 56 },
  hint: { flexDirection: 'row', alignItems: 'center', marginLeft: 36 },
  hintText: { flex: 1 },
  description: { minHeight: 72 },
  subheader: { paddingHorizontal: 0, marginTop: 8 },
});
