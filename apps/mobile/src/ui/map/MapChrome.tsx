import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { FAB, List, Portal, Switch, Text } from 'react-native-paper';
import { useColors } from '../theme/useColors';
import { ACTIVITY_COLORS, type MapTheme } from '@lupira/cal-tokens/map';
import { ICONS } from '../icons';

/** Map chrome: the layer sheet and the locate button. Six layers don't fit a chip row on a phone, so
 *  toggles live in a sheet and the map itself stays unobstructed. */

export type LayerKey = 'events' | 'saved' | 'photos' | 'movement' | 'contacts';

export const LAYER_LABELS: Record<LayerKey, string> = {
  events: 'Events',
  saved: 'Saved places',
  photos: 'Photos',
  movement: 'Where I’ve been',
  contacts: 'Contacts',
};

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  events: true,
  saved: true,
  photos: true,
  movement: true,
  contacts: false,
};

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

export function LayersSheet({ theme, enabled, onToggle, onDismiss }: {
  theme: MapTheme;
  enabled: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const activities = ACTIVITY_COLORS[theme];

  return (
    <Portal>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface }]}>
          <Text style={[styles.title, { color: c.text }]}>Layers</Text>
          <ScrollView>
            {(Object.keys(LAYER_LABELS) as LayerKey[]).map((key) => (
              <List.Item
                key={key}
                title={LAYER_LABELS[key]}
                titleStyle={{ color: c.text }}
                right={() => <Switch value={enabled[key]} onValueChange={() => onToggle(key)} />}
              />
            ))}
            {enabled.movement && (
              <View style={styles.legend}>
                {Object.entries(activities).map(([name, color]) => (
                  <View key={name} style={styles.legendItem}>
                    <View style={[styles.swatch, { backgroundColor: color }]} />
                    <Text style={[styles.legendLabel, { color: c.textMuted }]}>{name}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 12, maxHeight: '70%' },
  title: { fontSize: 16, fontWeight: '600', paddingHorizontal: 16, paddingBottom: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { fontSize: 12 },
});
