import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import { tasksGetItem as getItem } from '@lupira/cal-api/fetch/tasks';
import { assigneeLabel, dueLine, isTaskOverdue, taskDeepLink } from '@lupira/cal-domain/tasks';
import { Centered } from '../components/Centered';
import { Button } from '../components/Button';
import type { RootStackParamList } from '../navigation/types';
import { useColors, spacing } from '../theme';
import { toastError } from '../../feedback/toast';

/** Read-only view of a LupiraTasks deadline. Online-only by design (tasks never enter the mirror);
 *  editing lives in the Lupira Tasks app, reached via the deep link below. */
export function TaskDetailScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const { listId, itemId } = route.params;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tasks', 'detail', listId, itemId],
    staleTime: 60_000,
    retry: 1,
    queryFn: () => getItem(listId, itemId),
  });

  if (isLoading) return <Centered text="Loading…" />;
  if (isError) return <Centered text="Needs a connection to the server." />;
  if (!data || data.status !== 200) return <Centered text="Task not found (or no access)." />;
  const task = data.data;

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
