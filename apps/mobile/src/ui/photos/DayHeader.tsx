import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chip, IconButton, Text } from 'react-native-paper';
import { linkedEventIds, topPlaces } from '@lupira/cal-domain/photoFormat';
import { useLinkedEvents } from '../../state/usePhotoEventLinks';
import type { PhotoDay } from '../../state/usePhotoLibrary';
import { useColors } from '../theme';
import { ICONS } from '../icons';

/** A day's date, where it was and what it was — each a way to narrow the grid to it. */
export const DayHeader = memo(function DayHeader({ day, links, selecting, allSelected, onToggleDay, onPlace, onEvent, onMap }: {
  day: PhotoDay;
  links: ReadonlyMap<string, readonly string[]>;
  selecting: boolean;
  allSelected: boolean;
  onToggleDay: (day: PhotoDay) => void;
  onPlace: (label: string) => void;
  onEvent: (eventId: string) => void;
  onMap: (at: { lon: number; lat: number }) => void;
}) {
  const c = useColors();
  const places = topPlaces(day.data, 2);
  const events = useLinkedEvents(linkedEventIds(day.data.map((p) => p.id), links).slice(0, 3));
  const located = day.data.find((p) => p.latitude != null && p.longitude != null);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.line}>
        <Text style={[styles.label, { color: c.textMuted }]}>{day.label}</Text>
        {places.map((label) => (
          <Pressable key={label} hitSlop={6} onPress={() => onPlace(label)} style={styles.place}>
            <Text numberOfLines={1} style={[styles.placeText, { color: c.primary }]}>{label}</Text>
          </Pressable>
        ))}
        <View style={styles.spacer} />
        {located && !selecting && (
          <IconButton
            icon={ICONS.map}
            size={16}
            style={styles.map}
            onPress={() => onMap({ lon: located.longitude!, lat: located.latitude! })}
            accessibilityLabel="Show this day on the map"
          />
        )}
        {selecting && (
          <Pressable hitSlop={8} onPress={() => onToggleDay(day)}>
            <Text style={[styles.label, { color: c.primary }]}>{allSelected ? 'Deselect day' : 'Select day'}</Text>
          </Pressable>
        )}
      </View>
      {events.length > 0 && (
        <View style={styles.events}>
          {events.map((event) => (
            <Chip key={event.id} compact icon={ICONS.calendar} textStyle={styles.eventText} onPress={() => onEvent(event.id)}>
              {event.title}
            </Chip>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  label: { fontSize: 13, fontWeight: '600' },
  place: { flexShrink: 1 },
  placeText: { fontSize: 13 },
  spacer: { flex: 1 },
  map: { margin: 0, width: 24, height: 24 },
  events: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  eventText: { fontSize: 12 },
});
