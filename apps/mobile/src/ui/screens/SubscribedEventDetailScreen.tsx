import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { displayTitle, statusBadge } from '@danbro96/lupira-domain-events/itemLabels';
import { Glyph } from '@danbro96/lupira-expo-paper/components/Glyph';
import { useSubscribedEvent, useSubscribedOccurrence } from '../../state/useSubscriptions';
import { Centered } from '../components/Centered';
import { PlaceTile } from '../components/PlaceTile';
import { ICONS } from '../icons';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors } from '../theme';

/** A subscribed feed's event, read-only. Title, time, place and status come from the mirror; the description and
 *  the subscription's name need a connection. */
export function SubscribedEventDetailScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'SubscribedEventDetail'>>();
  const { data: occurrence, isLoading } = useSubscribedOccurrence(route.params.eventId, route.params.start);
  const { data: event } = useSubscribedEvent(occurrence);

  if (isLoading) return <Centered text="Loading…" />;
  if (!occurrence) return <Centered text="Event not found (or no access)." />;

  const allDay = occurrence.all_day === 1;
  const badge = statusBadge(occurrence.status);
  const cancelled = occurrence.status === 'Cancelled';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.inset}>
        <Text style={[styles.h1, cancelled && styles.struck]}>
          <Glyph name={ICONS.subscribed} size={20} /> {displayTitle(occurrence.title)}
        </Text>
        <Text style={[styles.when, { color: c.textMuted }]}>
          {fmtWhen(occurrence.start_utc, allDay)}
          {occurrence.end_utc ? ` → ${fmtWhen(occurrence.end_utc, allDay)}` : ''}
        </Text>
        {event?.isRecurring && <Text style={[styles.note, { color: c.textMuted }]}>Recurring</Text>}
        {badge && (
          <View style={styles.chipRow}>
            <Chip compact mode="outlined">{badge}</Chip>
          </View>
        )}
      </View>
      {occurrence.location && <PlaceTile placeId={null} label={occurrence.location} />}
      <View style={styles.inset}>
        {event?.description ? <Text style={styles.description}>{event.description}</Text> : null}
        <Text style={[styles.note, { color: c.textMuted }]}>
          {event ? `From ${event.subscriptionName} · read-only` : 'From a subscribed calendar · read-only'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.md, gap: spacing.xs },
  inset: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  h1: { fontSize: 20, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through' },
  when: { fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  description: { fontSize: 14 },
  note: { fontSize: 13 },
});
