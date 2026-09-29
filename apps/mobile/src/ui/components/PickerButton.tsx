import { StyleSheet, View } from 'react-native';
import { Button as PaperButton, IconButton } from 'react-native-paper';
import { useColors } from '../theme';
import { ICONS } from '../icons';

/** The shared surface behind DateField and TimeField: a value button plus, when clearable, a clear affordance. */
export function PickerButton({ text, isSet, onPress, onClear }: {
  text: string; isSet: boolean; onPress: () => void; onClear?: () => void;
}) {
  const c = useColors();
  return (
    <View style={styles.pickerRow}>
      <PaperButton mode="outlined" style={styles.picker} textColor={isSet ? undefined : c.textMuted} onPress={onPress}>
        {text}
      </PaperButton>
      {isSet && onClear && <IconButton icon={ICONS.close} size={16} onPress={onClear} />}
    </View>
  );
}

const styles = StyleSheet.create({
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  picker: { flexGrow: 1 },
});
