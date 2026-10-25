import { ChoiceChips } from '@danbro96/lupira-expo-paper/components/ChoiceChips';
import type { TaskComposer } from '../../state/useNewTask';
import { DateField } from './DateField';
import { Field } from './Field';

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
        <DateField value={composer.dueDay} onChange={composer.setDueDay} weekday />
      </Field>
    </>
  );
}
