import { describeRrule } from '@lupira/cal-domain/rrule';
import { deviceTimeZone } from '@lupira/cal-domain/zonedTime';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, List, Switch, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ItemForm, ScheduleField } from '../../domain/editors';
import {
  acceptedCalendarIds, attendeeChanges, categoryAllDayDefault, emptyItemForm, filingChanges, itemCoreFromForm,
  itemFormFromDoc, withAllDay, withSchedule,
} from '../../domain/editors';
import { saveItem } from '../../state/actions';
import { useContactList } from '../../state/useContactList';
import { selectableCalendars, useCalendars } from '../../state/useContainers';
import { useItemState } from '../../state/useItemState';
import { DateField } from '../components/DateField';
import { Input } from '../components/Input';
import { TimeField } from '../components/TimeField';
import { CalendarsSheet } from '../event/CalendarsSheet';
import { CategorySheet, categoryIcon } from '../event/CategorySheet';
import { PeopleSheet } from '../event/PeopleSheet';
import { PlaceSheet } from '../event/PlaceSheet';
import { RepeatSheet } from '../event/RepeatSheet';
import { TimeZoneSheet, zoneSummary } from '../event/TimeZoneSheet';
import { ICONS } from '../icons';
import type { RootStackParamList } from '../navigation/types';
import { useUnsavedGuard } from '../navigation/useUnsavedGuard';
import { spacing, useColors } from '../theme';

type SheetName = 'calendars' | 'category' | 'repeat' | 'zone' | 'place' | 'people';

/** Title, when, where and notes up front; everything used rarely is one row each under More, opening a sheet. */
export function ItemEditScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'ItemEdit'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const itemId = route.params?.itemId;
  const { data: state } = useItemState(itemId ?? '');
  const { data: calendars } = useCalendars();
  const { data: contacts } = useContactList();
  const pickable = selectableCalendars(calendars);

  const [form, setForm] = useState<ItemForm>(() => emptyItemForm(route.params?.day, route.params?.time));
  const [calendarIds, setCalendarIds] = useState<string[]>([]);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(!itemId);

  /** Pristine snapshots; the exit guard and the header's Save state key off differences from them. */
  const baseline = useRef({ form: JSON.stringify(form), calendars: '[]', people: '[]' });

  useEffect(() => {
    if (!seeded && itemId && state) {
      const seededForm = itemFormFromDoc(state.doc);
      const seededCalendars = acceptedCalendarIds(state.doc.calendars);
      const seededPeople = (state.doc.attendees ?? []).map((a) => a.contactId);
      setForm(seededForm);
      setCalendarIds(seededCalendars);
      setAttendeeIds(seededPeople);
      baseline.current = {
        form: JSON.stringify(seededForm), calendars: JSON.stringify(seededCalendars), people: JSON.stringify(seededPeople),
      };
      setSeeded(true);
    }
  }, [seeded, itemId, state]);
  useEffect(() => {
    const first = selectableCalendars(calendars)[0];
    if (itemId || calendarIds.length > 0 || !first) return;
    setCalendarIds([first.id]);
    baseline.current = { ...baseline.current, calendars: JSON.stringify([first.id]) };
  }, [itemId, calendarIds, calendars]);

  const dirty = JSON.stringify(form) !== baseline.current.form
    || JSON.stringify(calendarIds) !== baseline.current.calendars
    || JSON.stringify(attendeeIds) !== baseline.current.people;
  /** Bridges the guard to the submit closure (assigned below) without re-subscribing every render. */
  const submitRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const guard = useUnsavedGuard(dirty, {
    message: 'Save this event before leaving?',
    onSave: () => submitRef.current(),
  });

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
      return allDay === null ? next : withAllDay(next, allDay);
    });
  };

  /** Persists without navigating; false = validation failed, so the guard keeps the user here. */
  const submit = async (): Promise<boolean> => {
    const r = itemCoreFromForm(form, state?.doc);
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
    try {
      await saveItem(itemId, {
        core: r.value,
        ...filingChanges(state?.doc.calendars ?? [], calendarIds),
        ...attendeeChanges(state?.doc.attendees ?? [], attendeeIds),
      });
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };
  submitRef.current = submit;

  const saveAndLeave = () => {
    void submit().then((saved) => {
      if (!saved) return;
      guard.leave();
      navigation.goBack();
    });
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

  const calendarName = (id: string) => calendars?.find((cal) => cal.id === id)?.displayName ?? id;
  const contactName = (id: string) => contacts?.find((row) => row.id === id)?.displayName ?? 'Unknown contact';
  const people = attendeeIds.length === 0
    ? 'Nobody invited'
    : attendeeIds.slice(0, 2).map(contactName).join(', ') + (attendeeIds.length > 2 ? ` +${attendeeIds.length - 2}` : '');
  const cancelled = form.status === 'Cancelled';
  const otherZone = !form.isAllDay && !!form.timeZone && form.timeZone !== deviceTimeZone();
  const legacyLocation = !form.place ? state?.doc.locationLabel : null;

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        {cancelled && (
          <Text style={[styles.notice, { color: c.danger }]}>This event is cancelled — restore it from the event screen.</Text>
        )}
        <Input label="Title" autoFocus={!itemId} style={styles.title} value={form.title} onChangeText={(v) => set('title', v)} />

        <List.Item
          title="All-day"
          style={styles.row}
          left={(p) => <List.Icon {...p} icon={ICONS.schedule} />}
          right={() => <Switch value={form.isAllDay} onValueChange={toggleAllDay} />}
        />
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
              placeholder={form.isAllDay ? 'Same day' : 'Set date'}
              value={form.endDay}
              onChange={(v) => (v ? setSchedule('endDay', v) : clearEnd())}
            />
          </View>
          {!form.isAllDay && (
            <View style={styles.time}>
              <TimeField clearable={false} value={form.endTime} onChange={(v) => setSchedule('endTime', v)} />
            </View>
          )}
        </View>
        {otherZone && <Text style={[styles.muted, styles.zoneNote, { color: c.textMuted }]}>Times in {zoneSummary(form.timeZone)}</Text>}

        <List.Item
          title={form.place?.label || 'Add place'}
          titleStyle={!form.place ? { color: c.textMuted } : undefined}
          description={legacyLocation ? `“${legacyLocation}” from calendar text` : undefined}
          style={styles.row}
          left={(p) => <List.Icon {...p} icon={ICONS.place} />}
          onPress={() => setSheet('place')}
        />
        <Input
          label="Description"
          multiline
          numberOfLines={3}
          style={styles.description}
          value={form.description}
          onChangeText={(v) => set('description', v)}
        />

        <List.Subheader style={styles.subheader}>More</List.Subheader>
        {pickable.length > 1 && (
          <MoreRow icon={ICONS.calendar} title="Calendars" value={calendarIds.map(calendarName).join(', ')} onPress={() => setSheet('calendars')} />
        )}
        <MoreRow
          icon={form.category ? categoryIcon(form.category) : ICONS.event}
          title="Category"
          value={form.category || 'None'}
          onPress={() => setSheet('category')}
        />
        <MoreRow
          icon={ICONS.repeat}
          title="Repeats"
          value={form.recurrenceRule ? describeRrule(form.recurrenceRule) : 'Never'}
          onPress={() => setSheet('repeat')}
        />
        <MoreRow icon={ICONS.group} title="People" value={people} onPress={() => setSheet('people')} />
        {!form.isAllDay && !!form.timeZone && (
          <MoreRow icon={ICONS.public} title="Time zone" value={zoneSummary(form.timeZone)} onPress={() => setSheet('zone')} />
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
        <Input label="Tags (comma-separated)" autoCapitalize="none" value={form.tagsCsv} onChangeText={(v) => set('tagsCsv', v)} />

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
      {sheet === 'repeat' && (
        <RepeatSheet value={form.recurrenceRule} onPick={(v) => set('recurrenceRule', v)} onDismiss={() => setSheet(null)} />
      )}
      {sheet === 'zone' && <TimeZoneSheet value={form.timeZone} onPick={(v) => set('timeZone', v)} onDismiss={() => setSheet(null)} />}
      {sheet === 'place' && (
        <PlaceSheet
          hasPlace={!!form.place}
          onPick={(p) => set('place', p ? { placeId: p.placeId, label: p.label } : null)}
          onDismiss={() => setSheet(null)}
        />
      )}
      {sheet === 'people' && (
        <PeopleSheet
          selected={attendeeIds}
          attendees={state?.doc.attendees ?? []}
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

const styles = StyleSheet.create({
  container: { padding: 16 },
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
  description: { minHeight: 72 },
  subheader: { paddingHorizontal: 0, marginTop: 8 },
});
