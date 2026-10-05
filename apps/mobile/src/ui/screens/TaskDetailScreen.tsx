import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import { assigneeLabel, dueLine, isTaskOverdue, taskDeepLink } from '@lupira/cal-domain/tasks';
import { useTask } from '../../state/useTaskDeadlines';
import { Centered } from '../components/Centered';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import type { RootStackParamList } from '../navigation/types';
import { useColors, spacing } from '../theme';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';

/** Read-only view of a LupiraTasks deadline from the tasks mirror; editing lives in the Lupira Tasks app,
 *  reached via the deep link below. */
export function TaskDetailScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const { data: task, isLoading } = useTask(route.params.itemId);

  if (isLoading) return <Centered text="Loading…" />;
  if (!task) return <Centered text="Task not found (or no access)." />;

  const now = new Date();
  const overdue = isTaskOverdue(task, now);
  const openInTasks = () =>
    Linking.openURL(taskDeepLink(task.listId, task.id)).catch(() =>
      toastError('Lupira Tasks is not installed — task details live in that app.'),
    );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>⏰ {task.title}</Text>
      <Text style={[styles.when, { color: overdue ? c.danger : c.textMuted }]}>{dueLine(task, now)}</Text>
      <View style={styles.chipRow}>
        <Chip compact mode="outlined">{task.status}</Chip>
        {task.priority > 0 && (
          <Chip compact mode="outlined">{`Priority ${task.priority}`}</Chip>
        )}
      </View>
      {task.statusReason ? <Text style={[styles.note, { color: c.textMuted }]}>{task.statusReason}</Text> : null}
      {task.assignee && (
        <Text style={[styles.note, { color: c.textMuted }]}>Assigned to {assigneeLabel(task.assignee)}</Text>
      )}
      {task.notes ? <Text style={styles.notes}>{task.notes}</Text> : null}
      <View style={styles.actions}>
        <Button title="Open in Lupira Tasks ↗" onPress={openInTasks} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm },
  h1: { fontSize: 20, fontWeight: '700' },
  when: { fontSize: 14 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  note: { fontSize: 13 },
  notes: { fontSize: 14, marginTop: 4 },
  actions: { marginTop: spacing.md },
});
