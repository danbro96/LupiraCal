import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Icon, Text } from 'react-native-paper';
import { placeTitle } from '@danbro96/lupira-domain-places/places';
import type { PlaceContext } from '@lupira/cal-domain/placeContext';
import { predictionReasonText } from '@lupira/cal-domain/placePrediction';
import { selectPlace, type PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { useContactList } from '../../state/useContactList';
import { usePlaceCoords } from '../../state/usePlaceLookup';
import { usePlacePredictions } from '../../state/usePlacePredictions';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';

/** The event's place as one tap: the likeliest places as chips, the picked one selected, More… for the search.
 *  The line under the chips says why the picked place was offered. */
export function PlaceChipsRow({ ctx, value, onChange, onMore }: {
  ctx: PlaceContext;
  value: { placeId: string; label: string } | null;
  onChange: (place: PlaceSelection | null) => void;
  onMore: () => void;
}) {
  const c = useColors();
  const predictions = usePlacePredictions(ctx);
  const { data: contacts } = useContactList();
  const stored = usePlaceCoords([value?.placeId]).get(value?.placeId ?? '');
  const nameOf = (id: string) => contacts?.find((x) => x.id === id)?.displayName ?? 'Someone';
  const picked = predictions.find((p) => p.placeId === value?.placeId);
  const why = picked?.reasons.map((r) => predictionReasonText(r, nameOf)).join(' · ');

  return (
    <View style={styles.field}>
      <View style={styles.row}>
        <Icon source={ICONS.place} size={24} color={c.textMuted} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
          {value && !picked && (
            <Chip selected showSelectedOverlay onPress={() => onChange(null)} accessibilityHint="Removes the place">
              {placeTitle(value.label, stored?.name, value.placeId)}
            </Chip>
          )}
          {predictions.map((p) => (
            <Chip
              key={p.placeId}
              selected={p.placeId === value?.placeId}
              showSelectedOverlay
              accessibilityHint={p.reasons.map((r) => predictionReasonText(r, nameOf)).join(', ')}
              onPress={() => onChange(p.placeId === value?.placeId ? null : selectPlace(p.placeId, p.label, 'prediction'))}
            >
              {p.label}
            </Chip>
          ))}
          <Chip icon={ICONS.search} onPress={onMore}>More…</Chip>
        </ScrollView>
      </View>
      {!!why && <Text style={[styles.why, { color: c.textMuted }]} numberOfLines={1}>{why}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { gap: 6, paddingRight: spacing.lg },
  why: { fontSize: 13, marginTop: spacing.xs, marginLeft: 24 + spacing.md },
});
