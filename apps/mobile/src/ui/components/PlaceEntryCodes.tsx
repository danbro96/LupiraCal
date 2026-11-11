import { StyleSheet, View } from 'react-native';
import { EntryCodes } from '@danbro96/lupira-expo-paper/components/EntryCodes';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { removeEntryCode, setEntryCode } from '../../state/actions';
import { usePlaceEntry, useResidencyRows } from '../../state/useResidencies';
import { spacing } from '../theme';

/** A place's door codes from the mirror, editable offline while someone you can see lives there now. */
export function PlaceEntryCodes({ placeId }: { placeId: string | null | undefined }) {
  const { codes, canAdd } = usePlaceEntry(placeId, useResidencyRows());
  if (!placeId || !canAdd) return null;
  return (
    <View style={styles.row}>
      <EntryCodes
        codes={codes}
        editable
        onSave={(code) => void setEntryCode(placeId, code).catch(() => toastError('Could not save the door code.'))}
        onRemove={(codeId) => void removeEntryCode(placeId, codeId).catch(() => toastError('Could not remove the door code.'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
