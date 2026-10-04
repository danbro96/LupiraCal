import { Controller, useForm, useWatch } from 'react-hook-form';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { useCreateItem } from '@lupira/cal-api/query/cal';
import { AvailabilityStatus, type CreateCalendarItemRequest } from '@lupira/cal-api/models';
import { ymd } from '@lupira/cal-domain/time';
import { availabilityCalendar, availabilityEntry } from '@lupira/cal-domain/availability';
import { useContainers } from '../../state/useContainers';
import { useInvalidateItems } from '../../state/useInvalidate';
import { errText } from '../errText';
import { useSnackbar } from './SnackbarHost';
import { WrapRow } from './WrapRow';

type FormValues = {
  status: AvailabilityStatus | '';
  startDate: string;
  endDate: string;
};

/**
 * Availability quick-add: status + date range only. Entries are all-day items in the Availability-kind
 * calendar (title = status, presence status carried by `availability`), rendered as the background band
 * rather than chips — so the normal event form deliberately doesn't offer that calendar.
 */
export function AvailabilityModal({ onClose }: { onClose: () => void }) {
  const { calendars } = useContainers();
  const invalidate = useInvalidateItems();
  const showSnack = useSnackbar();
  const create = useCreateItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        onClose();
      },
      onError: (e) => showSnack(errText(e) ?? 'Request failed.'),
    },
  });

  const calendar = availabilityCalendar(calendars);
  const { control, handleSubmit } = useForm<FormValues>({
    defaultValues: { status: '', startDate: ymd(new Date()), endDate: '' },
  });
  const startDate = useWatch({ control, name: 'startDate' });

  const submit = handleSubmit((values) => {
    if (!calendar) return;
    const entry = availabilityEntry({ status: values.status, startDay: values.startDate, endDay: values.endDate });
    if (!entry.ok) {
      showSnack(entry.error);
      return;
    }
    const body: CreateCalendarItemRequest = { calendarId: calendar.id, ...entry.value, availability: values.status as AvailabilityStatus };
    create.mutate({ data: body });
  });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 1 }}>
        Set availability
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <form onSubmit={submit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0 }}>
          {!calendar && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">No availability calendar — bootstrap the standard set first.</Typography>}
        <WrapRow>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <TextField select label="Status" {...field} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                <MenuItem value="">Pick a status…</MenuItem>
                {Object.values(AvailabilityStatus).map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </WrapRow>
        <WrapRow>
          <Controller
            name="startDate"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <TextField type="date" label="From" slotProps={{ inputLabel: { shrink: true } }} {...field} required />
            )}
          />
        </WrapRow>
        <WrapRow>
          <Controller
            name="endDate"
            control={control}
            render={({ field }) => (
              <TextField
                type="date"
                label="Until"
                {...field}
                slotProps={{ htmlInput: { min: startDate }, inputLabel: { shrink: true } }}
              />
            )}
          />
        </WrapRow>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="contained" type="submit" disabled={!calendar || create.isPending}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
