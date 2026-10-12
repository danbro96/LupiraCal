import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { initialTaskListId, type TaskListLike } from '@lupira/cal-domain/tasks';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { toast, toastError } from '@danbro96/lupira-expo-feedback/toast';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { ChoiceChips } from '@danbro96/lupira-expo-paper/components/ChoiceChips';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { usePrefs } from '../../state/prefs-store';
import { createTask, useWritableTaskLists } from '../../state/useNewTask';
import { Centered } from '../components/Centered';
import { DateField } from '../components/DateField';
import { Field } from '../components/Field';
import type { RootStackParamList } from '../navigation/types';
import { useColors, spacing } from '../theme';

/** A LupiraTasks task from the calendar: list, title, optional due day. Needs a connection — tasks are created
 *  server-side, not queued. */
export function TaskCreateScreen() {
  const online = useOnline();
  const { data: lists, isLoading } = useWritableTaskLists();

  if (!online) return <Centered text="Needs a connection to add a task." />;
  if (isLoading || !lists) return <Centered text="Loading…" />;
  if (!lists.length) return <Centered text="No task list you can add to. Create one in Lupira Tasks." />;
  return <TaskForm lists={lists} />;
}

function TaskForm({ lists }: { lists: TaskListLike[] }) {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskCreate'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const event = route.params?.event;
  const lastTaskListId = usePrefs((p) => p.lastTaskListId);
  const setLastTaskListId = usePrefs((p) => p.setLastTaskListId);

  const [listId, setListId] = useState(() => initialTaskListId(lists, lastTaskListId));
  const [title, setTitle] = useState('');
  const [dueDay, setDueDay] = useState(event?.day ?? '');
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    createTask({ listId, title, dueDay: dueDay || null, eventId: event?.id })
      .then(() => {
        void setLastTaskListId(listId);
        toast('Task added');
        navigation.goBack();
      })
      .catch((e: unknown) => {
        setSaving(false);
        toastError(e instanceof Error ? e.message : 'Could not add the task.');
      });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {event && <Text style={[styles.muted, { color: c.textMuted }]}>Linked to “{event.title}”</Text>}
      <TextField label="Title" value={title} onChangeText={setTitle} autoFocus />
      <Field label="List">
        <ChoiceChips options={lists.map((l) => ({ value: l.id, label: l.name }))} value={listId} onChange={setListId} required />
      </Field>
      <Field label="Due (optional)">
        <DateField value={dueDay} onChange={setDueDay} weekday />
      </Field>
      <View style={styles.buttons}>
        <Button title="Add task" onPress={save} disabled={!title.trim() || !listId || saving} loading={saving} />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  muted: { fontSize: 13, marginBottom: 8 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 20 },
});
