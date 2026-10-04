import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';
import { copyText } from '../../feedback/copy';
import { usePlaceEntry, useResidencyRows } from '../../state/useResidencies';
import { ICONS } from '../icons';
import { spacing } from '../theme';

/** A place's door and gate codes, masked until tapped; hold copies. Offline from the mirror; nothing when nobody you
 *  can see lives there now. The code itself is never logged. */
export function EntryCodes({ placeId }: { placeId: string | null | undefined }) {
  const entry = usePlaceEntry(placeId, useResidencyRows());
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  if (!entry) return null;
  return (
    <View style={styles.row}>
      {entry.codes.map((c) => (
        <Chip
          key={c.id}
          compact
          icon={ICONS.entryCode}
          onPress={() => setShown((s) => new Set(s).add(c.id))}
          onLongPress={() => copyText(c.code, c.label)}
          accessibilityHint="Tap to show, hold to copy"
        >
          {`${c.label} ${shown.has(c.id) ? c.code : '••••'}${c.note && shown.has(c.id) ? ` · ${c.note}` : ''}`}
        </Chip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
