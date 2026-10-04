import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { List, Portal, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { matchTimeline, PHOTO_SEARCH, type DayRange, type TimelineYear } from '@lupira/cal-domain/photoTimeline';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { SCRIM } from '@danbro96/lupira-tokens-core/color';
import { useEventSearch } from '../../state/usePhotoEventLinks';
import { usePlaceSuggestions } from '../../state/usePhotoLibrary';
import { Input } from '../components/Input';
import { useColors } from '../theme';
import { ICONS } from '../icons';

/** One box for the three ways people remember a photo: when, at what, and where. Top-anchored so the
 *  keyboard never covers the suggestions; submitting free text filters by place. */
export function PhotoSearchSheet({ timeline, onDate, onEvent, onPlace, onDismiss }: {
  timeline: TimelineYear[];
  onDate: (range: DayRange) => void;
  onEvent: (eventId: string) => void;
  onPlace: (label: string) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const term = q.trim();
  const dates = term.length >= PHOTO_SEARCH.minQuery ? matchTimeline(timeline, term, PHOTO_SEARCH.dates) : [];
  const { data: events } = useEventSearch(term);
  const { data: places } = usePlaceSuggestions(term);

  const done = (apply: () => void) => {
    apply();
    onDismiss();
  };

  return (
    <Portal>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface, paddingTop: insets.top + 8 }]}>
          <Input
            label="Event, place or month"
            autoFocus
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
            onSubmitEditing={() => { if (term) done(() => onPlace(term)); }}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {dates.length > 0 && <List.Subheader>Dates</List.Subheader>}
            {dates.map((m) => (
              <List.Item
                key={`${m.range.from}:${m.range.to}`}
                title={m.label}
                description={`${m.count} photos`}
                left={(props) => <List.Icon {...props} icon={ICONS.schedule} />}
                onPress={() => done(() => onDate(m.range))}
              />
            ))}
            {(events ?? []).length > 0 && <List.Subheader>Events</List.Subheader>}
            {(events ?? []).map((e) => (
              <List.Item
                key={e.id}
                title={displayTitle(e.title)}
                description={fmtWhen(e.start, e.isAllDay)}
                left={(props) => <List.Icon {...props} icon={ICONS.calendar} />}
                onPress={() => done(() => onEvent(e.id))}
              />
            ))}
            {(places ?? []).length > 0 && <List.Subheader>Places</List.Subheader>}
            {(places ?? []).map((p) => (
              <List.Item
                key={p.label}
                title={p.label}
                description={`${p.count} photos`}
                left={(props) => <List.Icon {...props} icon={ICONS.place} />}
                onPress={() => done(() => onPlace(p.label))}
              />
            ))}
            {term.length > 0 && !(places ?? []).some((p) => p.label.toLocaleLowerCase() === term.toLocaleLowerCase()) && (
              <List.Item
                title={`Places matching “${term}”`}
                left={(props) => <List.Icon {...props} icon={ICONS.place} />}
                onPress={() => done(() => onPlace(term))}
              />
            )}
            {term.length === 0 && (
              <Text style={[styles.hint, { color: c.textMuted }]}>Try “midsummer”, “Visby” or “july 2024”.</Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-start', backgroundColor: SCRIM.backdrop },
  sheet: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingHorizontal: 16, paddingBottom: 8, maxHeight: '75%' },
  hint: { fontSize: 13, marginVertical: 12 },
});
