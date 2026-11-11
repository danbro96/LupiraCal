import { StyleSheet, View } from 'react-native';
import { ChoiceChips } from '@danbro96/lupira-expo-paper/components/ChoiceChips';
import type { TaskComposer } from '../../state/useNewTask';
import { DateField } from './DateField';
import { Field } from './Field';
import { TimeField } from './TimeField';

export function TaskFields({ composer }: { composer: TaskComposer }) {
  return (
    <>
      <Field label="List">
        <ChoiceChips
          options={composer.lists.map((l) => ({ value: l.id, label: l.name }))}
          value={composer.listId}
          onChange={composer.setListId}
          required
        />
      </Field>
      <Field label="Due (optional)">
        <View style={styles.dueRow}>
          <View style={styles.day}>
            <DateField value={composer.dueDay} onChange={composer.setDueDay} weekday />
          </View>
          {!!composer.dueDay && (
            <View style={styles.time}>
              <TimeField value={composer.dueTime} onChange={composer.setDueTime} />
            </View>
          )}
        </View>
      </Field>
    </>
  );
}

const styles = StyleSheet.create({
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  day: { flex: 3 },
  time: { flex: 2 },
});
