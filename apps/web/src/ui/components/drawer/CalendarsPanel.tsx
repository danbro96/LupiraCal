import { useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import {
  useAcceptItemIntoCalendar,
  useFileItemToCalendar,
  useRemoveItemFromCalendar,
} from '@lupira/cal-api/query/cal';
import type { CalendarItemDto } from '@lupira/cal-api/models';
import { canWriteCalendar } from '@lupira/cal-domain/calendars';
import { calendarLabel, useContainers } from '../../../state/useContainers';
import { useInvalidateItems } from '../../../state/useInvalidate';
import { calendarColor } from '../../theme/kinds';
import { WrapRow } from '../WrapRow';
import { DrawerSection } from '../DrawerSection';

/** The item's calendar memberships (Proposed/Accepted) + curation actions and file-to-calendar. */
export function CalendarsPanel({ item }: { item: CalendarItemDto }) {
  const { calendars } = useContainers();
  const invalidate = useInvalidateItems();
  const accept = useAcceptItemIntoCalendar({ mutation: { onSuccess: invalidate } });
  const remove = useRemoveItemFromCalendar({ mutation: { onSuccess: invalidate } });
  const file = useFileItemToCalendar({ mutation: { onSuccess: invalidate } });
  const [target, setTarget] = useState('');

  const memberships = item.calendars.filter((m) => m.status !== 'Removed');
  const memberIds = new Set(memberships.map((m) => m.calendarId));
  const fileable = calendars.filter((c) => !memberIds.has(c.id) && canWriteCalendar(c));

  return (
    <DrawerSection title="Calendars">
      {memberships.map((m) => {
        const cal = calendars.find((c) => c.id === m.calendarId);
        const writable = !!cal && canWriteCalendar(cal);
        return (
          <Box key={m.calendarId} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: '6px', borderBottom: 1, borderColor: 'divider' }}>
            <Box component="span" sx={{ width: 13, height: 13, borderRadius: '999px', border: 1, borderColor: 'border', flex: 'none', display: 'inline-block' }} style={{ background: cal ? calendarColor(cal) : 'var(--mui-palette-border)' }} />
            <Box component="span" sx={{ flex: 1 }}>{cal ? calendarLabel(cal) : m.calendarId.slice(0, 8)}</Box>
            {m.status === 'Proposed' ? (
              <Chip variant="outlined" label="proposed" />
            ) : (
              <Chip variant="outlined" label="accepted" />
            )}
            {writable && m.status === 'Proposed' && (
              <Chip variant="outlined" label="Accept" onClick={() => accept.mutate({ itemId: item.id, calendarId: m.calendarId })} />
            )}
            {writable && (
              <Tooltip title="Remove from calendar">
                <IconButton onClick={() => remove.mutate({ itemId: item.id, calendarId: m.calendarId })}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        );
      })}
      <WrapRow>
        <TextField select value={target} onChange={(e) => setTarget(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
          <MenuItem value="">File into calendar…</MenuItem>
          {fileable.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {calendarLabel(c)}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="outlined"
          disabled={!target || file.isPending}
          onClick={() => {
            file.mutate({ itemId: item.id, calendarId: target, params: { status: 'accepted' } });
            setTarget('');
          }}
        >
          File
        </Button>
      </WrapRow>
    </DrawerSection>
  );
}
