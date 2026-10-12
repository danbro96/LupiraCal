import { useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ListDto } from '@lupira/cal-api/models';
import { initialTaskListId } from '@lupira/cal-domain/tasks';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { useCreateTask } from '../../state/useCreateTask';
import { useWritableTaskLists } from '../../state/useTaskLists';
import { readPref, writePref } from '../../state/localPrefs';
import { errText } from '../errText';
import { useIsPhone } from '../hooks/useIsPhone';

type FormValues = { listId: string; title: string; dueDay: string };

const LAST_LIST = 'newTask.listId';

export type TaskEvent = { id: string; title: string; day: string | null };

/** A LupiraTasks task from the calendar: list, title, optional due day; made from an event, it links to it. */
export function NewTaskDialog({ event, onClose }: { event?: TaskEvent; onClose: () => void }) {
  const isPhone = useIsPhone();
  const { lists, isLoading } = useWritableTaskLists();
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth fullScreen={isPhone}>
      <DialogTitle>{event ? 'Task for this event' : 'New task'}</DialogTitle>
      {isLoading ? (
        <DialogContent>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Loading lists…</Typography>
        </DialogContent>
      ) : (
        <TaskForm lists={lists} event={event} onClose={onClose} />
      )}
    </Dialog>
  );
}

function TaskForm({ lists, event, onClose }: { lists: ListDto[]; event?: TaskEvent; onClose: () => void }) {
  const [, setSearchParams] = useSearchParams();
  const showSnack = useSnackbar();
  const create = useCreateTask();
  const { control, handleSubmit } = useForm<FormValues>({
    defaultValues: { listId: initialTaskListId(lists, readPref(LAST_LIST)), title: '', dueDay: event?.day ?? '' },
  });

  const submit = handleSubmit((v) => {
    create.mutate(
      { listId: v.listId, title: v.title, dueDay: v.dueDay || null, eventId: event?.id },
      {
        onSuccess: (task) => {
          writePref(LAST_LIST, v.listId);
          onClose();
          showSnack('Task added', 'success', {
            label: 'Open',
            onPress: () =>
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('task', `${task.listId}:${task.id}`);
                next.delete('item');
                return next;
              }),
          });
        },
        onError: (e) => showSnack(errText(e) ?? 'Request failed.'),
      },
    );
  });

  if (!lists.length) {
    return (
      <>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No task list you can add to. Create one in Lupira Tasks.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0 }}>
        {event && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Linked to “{event.title}”</Typography>}
        <Controller
          name="title"
          control={control}
          rules={{ validate: (t) => !!t.trim() }}
          render={({ field }) => <TextField label="Title" autoFocus required {...field} />}
        />
        <Controller
          name="listId"
          control={control}
          render={({ field }) => (
            <TextField select label="List" {...field}>
              {lists.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          name="dueDay"
          control={control}
          render={({ field }) => <TextField type="date" label="Due" slotProps={{ inputLabel: { shrink: true } }} {...field} />}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" type="submit" disabled={create.isPending}>
          Add task
        </Button>
      </DialogActions>
    </form>
  );
}
