import { useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { useCreateItem } from '@lupira/cal-api/query/cal';
import type { CreateCalendarItemRequest } from '@lupira/cal-api/models';
import { RRULE_PRESETS } from '@lupira/cal-domain/rrule';
import { ymd } from '@lupira/cal-domain/time';
import { deviceTimeZone } from '@lupira/cal-domain/zonedTime';
import { canWriteCalendar } from '@lupira/cal-domain/calendars';
import { calendarLabel, useContainers } from '../../state/useContainers';
import { useInvalidateItems } from '../../state/useInvalidate';
import { useJoinItem } from '../../state/useJoinItem';
import { readPref, writePref } from '../../state/localPrefs';
import { useMyContactId } from '../../state/useMe';
import { localInputToIso } from './drawer/inputs';
import { PlacePicker } from './places/PlacePicker';
import { errText } from '../errText';
import { useSnackbar } from './SnackbarHost';
import { useIsPhone } from '../hooks/useIsPhone';
import { WrapRow } from './WrapRow';

type FormValues = {
  title: string;
  calendarId: string;
  isAllDay: boolean;
  start: string;
  end: string;
  startDate: string;
  endDate: string;
  placeId: string;
  rrule: string;
  attending: boolean;
  tags: string;
  description: string;
};

const LAST_CALENDAR = 'newItem.calendarId';

/** Quick-create: title, calendar, when (timed or all-day), place, recurrence, tags — and you, already going,
 *  unless unticked. Starts on the calendar the last event went to. Availability has its own form. */
export function NewItemModal({ onClose }: { onClose: () => void }) {
  const isPhone = useIsPhone();
  const { calendars: allCalendars } = useContainers();
  const calendars = allCalendars.filter((c) => c.kind !== 'Availability' && canWriteCalendar(c));
  const me = useMyContactId();
  const join = useJoinItem();
  const invalidate = useInvalidateItems();
  const [, setSearchParams] = useSearchParams();
  const showSnack = useSnackbar();
  const create = useCreateItem({
    mutation: {
      onSuccess: async (created, { data }) => {
        writePref(LAST_CALENDAR, data.calendarId ?? null);
        if (me && attending) await join(created.id, me).catch((e: unknown) => showSnack(errText(e) ?? 'Created, but could not add you.'));
        invalidate();
        onClose();
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('item', created.id);
          return next;
        });
      },
      onError: (e) => showSnack(errText(e) ?? 'Request failed.'),
    },
  });

  const remembered = readPref(LAST_CALENDAR);
  const defaultCalendar = calendars.find((c) => c.id === remembered) ?? calendars.find((c) => c.kind === 'Personal') ?? calendars[0];
  const { control, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: {
      title: '',
      calendarId: defaultCalendar?.id ?? '',
      isAllDay: false,
      start: '',
      end: '',
      startDate: ymd(new Date()),
      endDate: '',
      placeId: '',
      rrule: '',
      attending: true,
      tags: '',
      description: '',
    },
  });
  const isAllDay = watch('isAllDay');
  const startDate = watch('startDate');
  const attending = watch('attending');

  const submit = handleSubmit((v) => {
    const body: CreateCalendarItemRequest = {
      calendarId: v.calendarId || null,
      title: v.title || null,
      description: v.description || null,
      placeId: v.placeId || null,
      isAllDay: v.isAllDay,
      startsAt: v.isAllDay ? null : localInputToIso(v.start),
      endsAt: v.isAllDay ? null : localInputToIso(v.end),
      // Typed in the browser's zone, so a repeating event keeps that local time across DST.
      startTimezone: v.isAllDay ? null : deviceTimeZone(),
      startDate: v.isAllDay ? v.startDate || null : null,
      endDate: v.isAllDay ? v.endDate || null : null,
      recurrenceRule: v.rrule || null,
      tags: v.tags
        ? v.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : null,
    };
    create.mutate({ data: body });
  });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth fullScreen={isPhone}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <form onSubmit={submit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0 }}>
        <Controller
          name="title"
          control={control}
          render={({ field }) => (
            <TextField
              variant="standard"
              fullWidth
              slotProps={{ input: { sx: { fontSize: '1.35rem', fontWeight: 600 } } }}
              placeholder="Title"
              autoFocus
              {...field}
            />
          )}
        />
        <WrapRow>
          <Controller
            name="calendarId"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="Calendar"
                {...field}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                {calendars.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {calendarLabel(c)}
                    {c.class === 'System' ? ' (system)' : ''}
                  </MenuItem>
                ))}
                <MenuItem value="">(unfiled → curation)</MenuItem>
              </TextField>
            )}
          />
          <Controller
            name="isAllDay"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={<Checkbox size="small" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                label="All day"
              />
            )}
          />
        </WrapRow>
        {isAllDay ? (
          <WrapRow>
            <Controller
              name="startDate"
              control={control}
              render={({ field }) => <TextField type="date" {...field} required />}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>→</Typography>
            <Controller
              name="endDate"
              control={control}
              render={({ field }) => <TextField type="date" {...field} slotProps={{ htmlInput: { min: startDate } }} />}
            />
          </WrapRow>
        ) : (
          <WrapRow>
            <Controller
              name="start"
              control={control}
              render={({ field }) => <TextField type="datetime-local" {...field} required />}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>→</Typography>
            <Controller name="end" control={control} render={({ field }) => <TextField type="datetime-local" {...field} />} />
          </WrapRow>
        )}
        <WrapRow>
          <Controller
            name="rrule"
            control={control}
            render={({ field }) => (
              <TextField
                select
                label="Repeats"
                {...field}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">never</MenuItem>
                {RRULE_PRESETS.map((p) => (
                  <MenuItem key={p.rrule} value={p.rrule}>
                    {p.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          {me && (
            <Controller
              name="attending"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox size="small" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="I'm attending"
                />
              )}
            />
          )}
        </WrapRow>
        <Controller
          name="placeId"
          control={control}
          render={({ field }) => (
            <PlacePicker placeId={field.value || null} placeholder="Place" onChange={(id) => field.onChange(id ?? '')} />
          )}
        />
        <Controller
          name="tags"
          control={control}
          render={({ field }) => <TextField placeholder="Tags (comma-separated)" {...field} />}
        />
        <Controller
          name="description"
          control={control}
          render={({ field }) => <TextField multiline minRows={3} placeholder="Description" {...field} />}
        />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="contained" type="submit" disabled={create.isPending}>
            Create
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
