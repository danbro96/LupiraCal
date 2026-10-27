import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import Box from '@mui/material/Box';
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
import type { CreateCalendarItemRequest, ItemColor } from '@lupira/cal-api/models';
import { NO_REPEAT, RRULE_PRESETS } from '@lupira/cal-domain/rrule';
import { ymd } from '@danbro96/lupira-domain-core/time';
import { deviceTimeZone } from '@lupira/cal-domain/zonedTime';
import { defaultCalendarIds, isSelectableCalendar } from '@lupira/cal-domain/calendars';
import { categoryAllDayDefault, emptyItemForm, parseList, scheduleFromForm, withCategoryAllDay, withSchedule, type ItemForm } from '@lupira/cal-domain/itemForm';
import { isItemCategory } from '@lupira/cal-domain/itemCategory';
import type { PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { calendarLabel, useContainers } from '../../state/useContainers';
import { useInvalidateItems } from '../../state/useInvalidate';
import { useJoinItem } from '../../state/useJoinItem';
import { readPref, writePref } from '../../state/localPrefs';
import { useMyContactId } from '../../state/useMe';
import { PlaceField } from './places/PlaceField';
import { errText } from '../errText';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { useIsPhone } from '../hooks/useIsPhone';
import { WrapRow } from './WrapRow';
import { CategorySelect } from './CategorySelect';
import { ColorDot } from './ColorDot';
import { calendarColor } from '../theme/kinds';

type FormValues = {
  title: string;
  calendarId: string;
  category: string;
  isAllDay: boolean;
  start: string;
  end: string;
  startDate: string;
  endDate: string;
  place: PlaceSelection | null;
  rrule: string;
  color: ItemColor | '';
  attending: boolean;
  tags: string;
  description: string;
};

const LAST_CALENDAR = 'newItem.calendarId';

/** Quick-create: title, calendar, category, when (timed or all-day), place, recurrence, tags — and you, already going,
 *  unless unticked. Starts on the calendar the last event went to. Availability has its own form. */
export function NewItemModal({ onClose }: { onClose: () => void }) {
  const isPhone = useIsPhone();
  const { calendars: allCalendars } = useContainers();
  const calendars = allCalendars.filter(isSelectableCalendar);
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
        onClose();
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('item', created.id);
          next.delete('occ');
          return next;
        });
        return invalidate();
      },
      onError: (e) => showSnack(errText(e) ?? 'Request failed.'),
    },
  });

  const remembered = readPref(LAST_CALENDAR);
  const [initial] = useState(() => emptyItemForm(ymd(new Date())));
  const { control, handleSubmit, getValues, setValue } = useForm<FormValues>({
    defaultValues: {
      title: '',
      calendarId: defaultCalendarIds(calendars, remembered ? [remembered] : [])[0] ?? '',
      category: 'General',
      isAllDay: false,
      start: `${initial.startDay}T${initial.startTime}`,
      end: `${initial.endDay}T${initial.endTime}`,
      startDate: initial.startDay,
      endDate: '',
      place: null,
      rrule: '',
      color: '',
      attending: true,
      tags: '',
      description: '',
    },
  });
  const isAllDay = useWatch({ control, name: 'isAllDay' });
  const startDate = useWatch({ control, name: 'startDate' });
  const start = useWatch({ control, name: 'start' });
  const attending = useWatch({ control, name: 'attending' });
  const category = useWatch({ control, name: 'category' });
  const calendarId = useWatch({ control, name: 'calendarId' });
  const calendar = calendars.find((c) => c.id === calendarId);
  const [scheduleTouched, setScheduleTouched] = useState(false);

  // Moving the start carries the end along, as on the phone (`@lupira/cal-domain/itemForm`).
  const moveStart = (field: 'start' | 'startDate', value: string) => {
    setScheduleTouched(true);
    const form = toItemForm(getValues());
    const moved = field === 'startDate'
      ? withSchedule(form, 'startDay', value)
      : withSchedule(withSchedule(form, 'startDay', value.slice(0, 10)), 'startTime', value.slice(11, 16));
    setValue(field, value);
    if (form.isAllDay) setValue('endDate', moved.endDay);
    else if (moved.endDay) setValue('end', `${moved.endDay}T${moved.endTime}`);
  };

  // As on the phone: a category steers all-day vs timed until the schedule is touched.
  const pickCategory = (value: string) => {
    setValue('category', value);
    const allDay = scheduleTouched ? null : categoryAllDayDefault(value);
    if (allDay === null) return;
    const next = withCategoryAllDay(toItemForm(getValues()), allDay, initial);
    setValue('isAllDay', next.isAllDay);
    if (next.isAllDay) {
      setValue('startDate', next.startDay);
      setValue('endDate', next.endDay);
    } else {
      setValue('start', next.startDay ? `${next.startDay}T${next.startTime}` : '');
      setValue('end', next.endDay ? `${next.endDay}T${next.endTime}` : '');
    }
  };

  const submit = handleSubmit((v) => {
    const schedule = scheduleFromForm(toItemForm(v));
    if (!schedule.ok) {
      showSnack(schedule.error);
      return;
    }
    const tags = parseList(v.tags);
    const body: CreateCalendarItemRequest = {
      calendarId: v.calendarId || null,
      title: v.title || null,
      description: v.description || null,
      category: v.category,
      placeId: v.place?.placeId ?? null,
      ...schedule.value,
      recurrenceRule: v.rrule || null,
      tags: tags.length ? tags : null,
      color: v.color || undefined,
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
      <form onSubmit={(e) => void submit(e).catch((err: unknown) => showSnack(errText(err) ?? 'Request failed.'))}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Controller
            name="color"
            control={control}
            render={({ field }) => (
              <ColorDot
                value={field.value || null}
                calendarFill={calendar ? calendarColor(calendar) : 'var(--mui-palette-border)'}
                onChange={(color) => field.onChange(color ?? '')}
              />
            )}
          />
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
        </Box>
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
                  </MenuItem>
                ))}
                <MenuItem value="">(unfiled → curation)</MenuItem>
              </TextField>
            )}
          />
          <CategorySelect label="Category" value={category} onChange={pickCategory} />
          <Controller
            name="isAllDay"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={(
                  <Checkbox
                    size="small"
                    checked={field.value}
                    onChange={(e) => {
                      setScheduleTouched(true);
                      field.onChange(e.target.checked);
                    }}
                  />
                )}
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
              render={({ field }) => <TextField type="date" {...field} onChange={(e) => moveStart('startDate', e.target.value)} required />}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>→</Typography>
            <Controller
              name="endDate"
              control={control}
              render={({ field }) => (
                <TextField
                  type="date"
                  {...field}
                  onChange={(e) => {
                    setScheduleTouched(true);
                    field.onChange(e);
                  }}
                  slotProps={{ htmlInput: { min: startDate } }}
                />
              )}
            />
          </WrapRow>
        ) : (
          <WrapRow>
            <Controller
              name="start"
              control={control}
              render={({ field }) => <TextField type="datetime-local" {...field} onChange={(e) => moveStart('start', e.target.value)} required />}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>→</Typography>
            <Controller
              name="end"
              control={control}
              render={({ field }) => (
                <TextField
                  type="datetime-local"
                  {...field}
                  onChange={(e) => {
                    setScheduleTouched(true);
                    field.onChange(e);
                  }}
                />
              )}
            />
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
                <MenuItem value="">{NO_REPEAT}</MenuItem>
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
          name="place"
          control={control}
          render={({ field }) => (
            <PlaceField
              label="Place"
              value={field.value}
              onChange={field.onChange}
              context={{ kind: 'event', category: isItemCategory(category) ? category : 'General', attendeeIds: [], day: (isAllDay ? startDate : start.slice(0, 10)) || initial.startDay }}
            />
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

/** The modal's fields as the shared event form. Typed in the browser's zone, so a repeating event keeps that
 *  local time across DST. */
function toItemForm(v: FormValues): ItemForm {
  return {
    ...emptyItemForm(),
    isAllDay: v.isAllDay,
    startDay: v.isAllDay ? v.startDate : v.start.slice(0, 10),
    startTime: v.isAllDay ? '' : v.start.slice(11, 16),
    endDay: v.isAllDay ? v.endDate : v.end.slice(0, 10),
    endTime: v.isAllDay ? '' : v.end.slice(11, 16),
    recurrenceRule: v.rrule,
    timeZone: deviceTimeZone() ?? '',
  };
}

