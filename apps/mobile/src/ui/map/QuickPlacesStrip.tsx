import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Icon } from 'react-native-paper';
import type { QuickPlace } from '@lupira/cal-domain/quickPlaces';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';

const QUICK_PLACE_ICONS: Record<QuickPlace['kind'], string> = {
  home: ICONS.home, work: ICONS.work, parents: ICONS.family, event: ICONS.event,
};

/** Jump targets under the header — your home and work, your parents' home, then what's coming up. Scrolls sideways when they
 *  don't fit; renders nothing when there is nowhere to jump. Not ScreenToolbar: its padding would clip the
 *  scroll short of the screen edges. */
export function QuickPlacesStrip({ places, onPick }: { places: QuickPlace[]; onPick: (place: QuickPlace) => void }) {
  const c = useColors();
  if (places.length === 0) return null;
  return (
    <View style={[styles.bar, { backgroundColor: c.bg, borderBottomColor: c.divider }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {places.map((p) => (
          <Chip
            key={p.key}
            compact
            disabled={!p.point}
            onPress={() => onPick(p)}
            icon={({ size }) => (
              <Icon
                source={QUICK_PLACE_ICONS[p.kind]}
                size={size}
                color={p.event?.color ?? c.primary}
              />
            )}
            accessibilityLabel={p.point ? `Go to ${p.label}` : `${p.label} — needs a connection`}
          >
            {p.label}
          </Chip>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
});
