import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { toast, toastError } from '@danbro96/lupira-expo-feedback/toast';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { useTaskComposer } from '../../state/useNewTask';
import { Centered } from '../components/Centered';
import { TaskFields } from '../components/TaskFields';
import type { RootStackParamList } from '../navigation/types';
import { useColors, spacing } from '../theme';

/** A LupiraTasks task linked to an event: list, title, optional due day. Needs a connection — tasks are created
 *  server-side, not queued. */
export function TaskCreateScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskCreate'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const event = route.params?.event;
  const composer = useTaskComposer(event?.day ?? '');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  if (composer.blocker) return <Centered text={composer.blocker} />;

  const save = () => {
    setSaving(true);
    composer.save(title, event?.id)
      .then(() => {
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
      <TaskFields composer={composer} />
      <View style={styles.buttons}>
        <Button title="Add task" onPress={save} disabled={!title.trim() || !composer.listId || saving} loading={saving} />
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
