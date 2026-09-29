import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { createItem } from '../../state/actions';
import { useCalendars } from '../../state/useContainers';
import { Button } from '../components/Button';
import { SegmentedPicker } from '../components/SegmentedPicker';
import { DateField } from '../components/DateField';
import { Field } from '../components/Field';
import { AVAILABILITY_COLORS } from '../hooks/palette';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';

const STATUS_OPTIONS = Object.keys(AVAILABILITY_COLORS);

/** Dedicated quick-add for availability: status + date range, nothing else. Entries are plain items in
 *  the Availability-kind calendar (title = status, all-day, presence status on the create); the grids
 *  render them as the background band. Editing = delete + re-add (entries are cheap). */
export function AvailabilityEditScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'AvailabilityEdit'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: calendars } = useCalendars();
  const availabilityCal = (calendars ?? []).find((c) => c.kind === 'Availability');

  const [status, setStatus] = useState('');
  const [startDay, setStartDay] = useState(route.params?.day ?? '');
  const [endDay, setEndDay] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!availabilityCal) return setError('No availability calendar in the mirror yet — sync first.');
    if (!status) return setError('Pick a status');
    if (!startDay) return setError('Pick a start date');
    if (endDay && endDay < startDay) return setError('End date is before the start date');
    setError(null);
    void createItem(availabilityCal.id, {
      title: status,
      description: null, status: null, category: null, tags: null, parentItemId: null,
      isAllDay: true,
      startsAt: null, endsAt: null,
      startDate: startDay,
      endDate: endDay || null,
      startTimezone: null, endTimezone: null, recurrenceRule: null,
      availability: status,
    }).then(() => navigation.goBack());
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Field label="Status">
        <SegmentedPicker options={STATUS_OPTIONS} selected={status} onSelect={setStatus} />
      </Field>
      <Field label="From">
        <DateField value={startDay} onChange={setStartDay} />
      </Field>
      <Field label="Until (optional)">
        <DateField value={endDay} onChange={setEndDay} />
      </Field>
      <Text style={[styles.muted, { color: c.textMuted }]}>
        Shows as a colored band in the calendar. To change a day, delete the entry from its day list and add a new one.
      </Text>
      {error && <Text style={[styles.error, { color: c.danger }]}>{error}</Text>}
      <View style={styles.buttons}>
        <Button title="Save" onPress={save} />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  muted: { fontSize: 13, marginTop: 12 },
  error: { marginTop: 8 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 20 },
});
