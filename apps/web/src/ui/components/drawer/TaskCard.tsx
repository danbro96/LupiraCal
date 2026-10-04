import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useTasksGetItem } from '@lupira/cal-api/query/tasks';
import type { ItemDto } from '@lupira/cal-api/models';
import { DetailDrawer } from './DetailDrawer';
import { DrawerSection } from '../DrawerSection';
import { assigneeLabel, dueLine, isTaskOverdue, taskDeepLink, taskWebUrl } from '@lupira/cal-domain/tasks';

/** Read-only view for a task deadline (lives in LupiraTasks, not cal): status, due, notes, and the
 *  deep link into the tasks app. The web fallback lands on the list — tasks-web has no per-task route. */
export function TaskCard({ listId, itemId, onClose }: { listId: string; itemId: string; onClose: () => void }) {
  const { data: task, isLoading } = useTasksGetItem(listId, itemId);

  return (
    <DetailDrawer onClose={onClose}>
      {isLoading && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Loading…</Typography>}
      {!isLoading && !task && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Task not found (or no access).</Typography>}
      {task && <TaskBody task={task} />}
    </DetailDrawer>
  );
}

function TaskBody({ task }: { task: ItemDto }) {
  const now = new Date();
  const overdue = isTaskOverdue(task, now);

  return (
    <Box sx={{ px: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box component="span" title="Task" sx={{ fontSize: 22 }}>
          ⏰
        </Box>
        <Typography component="h2" sx={{ mb: 1, color: 'text.secondary' }}>{task.title}</Typography>
      </Box>

      <DrawerSection title="Due">
        <Typography component="p" sx={{ mb: 1, color: overdue ? 'error.main' : 'text.secondary' }}>{dueLine(task, now)}</Typography>
      </DrawerSection>

      <DrawerSection title="Status">
        <Typography component="p" sx={{ mb: 1, color: 'text.secondary' }}>
          {task.status}
          {task.statusReason ? ` — ${task.statusReason}` : ''}
        </Typography>
        {task.priority > 0 && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Priority {task.priority}</Typography>}
        {task.assignee && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Assigned to {assigneeLabel(task.assignee)}</Typography>}
      </DrawerSection>

      {task.notes && (
        <DrawerSection title="Notes">
          <Typography component="p" sx={{ mb: 1, color: 'text.secondary' }}>{task.notes}</Typography>
        </DrawerSection>
      )}

      <DrawerSection>
        <Button variant="contained" href={taskDeepLink(task.listId, task.id)}>
          Open in Lupira Tasks
        </Button>
      </DrawerSection>
      <Button variant="text" href={taskWebUrl(task.listId)} target="_blank" rel="noreferrer">
        Open list on the web →
      </Button>
    </Box>
  );
}
