import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Icon, Text, TouchableRipple } from 'react-native-paper';
import { placeTitle } from '@danbro96/lupira-domain-places/places';
import type { PlaceContext } from '@lupira/cal-domain/placeContext';
import { PLACE_SEARCH_PROMPT } from '@lupira/cal-domain/placeOmnibox';
import { PREDICTION_CHIPS, predictionReasonText } from '@lupira/cal-domain/placePrediction';
import { selectPlace, type PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { useContactList } from '../../state/useContactList';
import { usePlaceCoords } from '../../state/usePlaceLookup';
import { usePlacePredictions } from '../../state/usePlacePredictions';
import { ICONS } from '../icons';
import { radii, spacing, useColors } from '../theme';

/** The event's place: a search field opening the full search, over the likeliest few places as chips with the
 *  picked one selected. The line under the chips says why the picked place was offered. */
export function PlaceChipsRow({ ctx, value, onChange, onSearch }: {
  ctx: PlaceContext;
  value: { placeId: string; label: string } | null;
  onChange: (place: PlaceSelection | null) => void;
  onSearch: () => void;
}) {
  const c = useColors();
  const predictions = usePlacePredictions(ctx);
  const { data: contacts } = useContactList();
  const stored = usePlaceCoords([value?.placeId]).get(value?.placeId ?? '');
  const nameOf = (id: string) => contacts?.find((x) => x.id === id)?.displayName ?? 'Someone';
  const picked = predictions.find((p) => p.placeId === value?.placeId);
  const chips = predictions.slice(0, PREDICTION_CHIPS);
  const why = picked?.reasons.map((r) => predictionReasonText(r, nameOf)).join(' · ');

  return (
    <View style={styles.field}>
      <View style={styles.row}>
        <Icon source={ICONS.place} size={24} color={c.textMuted} />
        <TouchableRipple onPress={onSearch} accessibilityRole="button" style={[styles.search, { borderColor: c.divider }]}>
          <View style={styles.searchInner}>
            <Icon source={ICONS.search} size={20} color={c.textMuted} />
            <Text style={{ color: c.textMuted }} numberOfLines={1}>{PLACE_SEARCH_PROMPT}</Text>
          </View>
        </TouchableRipple>
      </View>
      {(chips.length > 0 || !!value) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips} style={styles.indent}>
          {value && !chips.some((p) => p.placeId === value.placeId) && (
            <Chip selected showSelectedOverlay onPress={() => onChange(null)} accessibilityHint="Removes the place">
              {picked?.label ?? placeTitle(value.label, stored?.name, value.placeId)}
            </Chip>
          )}
          {chips.map((p) => (
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
        </ScrollView>
      )}
      {!!why && <Text style={[styles.why, { color: c.textMuted }]} numberOfLines={1}>{why}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  search: { flex: 1, borderWidth: 1, borderRadius: radii.md },
  searchInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10 },
  indent: { marginTop: spacing.sm, marginLeft: 24 + spacing.md },
  chips: { gap: 6, paddingRight: spacing.lg },
  why: { fontSize: 13, marginTop: spacing.xs, marginLeft: 24 + spacing.md },
});
