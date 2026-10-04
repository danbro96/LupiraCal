import { StyleSheet, View } from 'react-native';
import { Chip, FAB, Text } from 'react-native-paper';
import { MAP_FUTURE_DAYS, MAP_SINCE_LABELS, type MapSince } from '@lupira/cal-domain/mapWindow';
import { ACTIVITY_COLORS, MAP_COLORS, type MapTheme } from '@lupira/cal-tokens/map';
import { LAYERS, LAYER_KEYS, type LayerKey } from '@lupira/cal-tokens/mapLayers';
import { unmappableLine } from '@lupira/cal-domain/mapFeatures';
import { MAP_SINCE_OPTIONS } from '../../state/prefs-store';
import { SegmentedPicker } from '../components/SegmentedPicker';
import { Sheet } from '../components/Sheet';
import { ICON_BY_NAME, ICONS } from '../icons';
import { spacing, useColors } from '../theme';

/** Map chrome: the layer sheet and the locate button. Toggles live in a sheet so the map itself stays
 *  unobstructed; inside it they're a two-column chip grid — six layers in three rows. */

/** Follow-mode cycles off → centred → centred+rotated, the standard phone-map progression. */
export type FollowMode = 'off' | 'follow' | 'heading';

export function LocateFab({ mode, onPress, style }: {
  mode: FollowMode; onPress: () => void; style?: object;
}) {
  const icon = mode === 'off' ? ICONS.locate : mode === 'follow' ? ICONS.locateFixed : ICONS.heading;
  return <FAB icon={icon} size="small" onPress={onPress} style={style} accessibilityLabel="Show my location" />;
}

export function LayersFab({ onPress, style }: { onPress: () => void; style?: object }) {
  return <FAB icon={ICONS.layers} size="small" onPress={onPress} style={style} accessibilityLabel="Map layers" />;
}

/** One age limit for every dated layer; saved places and contacts are timeless. */
export function LayersSheet({ theme, enabled, since, unmappableCount, onToggle, onSince, onDismiss }: {
  theme: MapTheme;
  enabled: Record<LayerKey, boolean>;
  since: MapSince;
  unmappableCount: number;
  onToggle: (key: LayerKey) => void;
  onSince: (since: MapSince) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const colors = MAP_COLORS[theme];
  const caption = [
    `Events also show the next ${Math.round(MAP_FUTURE_DAYS / 30)} months.`,
    enabled.events && unmappableCount > 0
      ? `${unmappableLine(unmappableCount)}.`
      : null,
  ].filter(Boolean).join(' ');

  return (
    <Sheet title="Map layers" onDismiss={onDismiss}>
      <Text variant="labelMedium" style={[styles.label, { color: c.textMuted }]}>Show the last</Text>
      <SegmentedPicker options={MAP_SINCE_OPTIONS} selected={since} onSelect={onSince} getLabel={(v) => MAP_SINCE_LABELS[v]} />
      <Text style={[styles.caption, { color: c.textMuted }]}>{caption}</Text>
      <View style={styles.grid}>
        {LAYER_KEYS.map((key) => {
          const layer = LAYERS[key];
          const color = colors[layer.color];
          const on = enabled[key];
          return (
            <Chip
              key={key}
              mode="outlined"
              selected={on}
              showSelectedCheck={false}
              onPress={() => onToggle(key)}
              icon={ICON_BY_NAME[layer.icon]}
              style={[styles.chip, on && { borderColor: color }]}
              textStyle={styles.chipText}
              accessibilityState={{ selected: on }}
            >
              {layer.label}
            </Chip>
          );
        })}
      </View>
      {enabled.movement && (
        <View style={styles.legend}>
          {Object.entries(ACTIVITY_COLORS[theme]).map(([name, color]) => (
            <View key={name} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: color }]} />
              <Text style={[styles.legendLabel, { color: c.textMuted }]}>{name}</Text>
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.xs },
  caption: { fontSize: 12, marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  // Two per row: the grid's one gap between them comes off the pair.
  chip: { width: '48.5%' },
  chipText: { fontSize: 13 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 12 },
});
