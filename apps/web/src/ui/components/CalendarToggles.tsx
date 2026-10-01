import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { ContainerDto } from '@lupira/cal-api/models';
import { calendarLabel, useContainers } from '../../state/useContainers';
import { calendarColor } from '../theme/kinds';
import { KindIcon, NamedIcon } from './KindIcon';
import { useCalendarVisibility } from './CalendarVisibility';

/** Calendar toggles grouped by class — System calendars are the agent-facing set. The calendar screen places
 *  them: a side panel on desktop, a sheet on phones. */
export function CalendarToggles() {
  const { calendars } = useContainers();
  const { tasksVisible, toggleTasks } = useCalendarVisibility();
  const agenda = calendars.filter((c) => c.class !== 'System');
  const system = calendars.filter((c) => c.class === 'System');

  return (
    <Box sx={{ pb: 3 }}>
      <CalendarGroup title="Agenda" calendars={agenda} />
      <CalendarGroup title="System" calendars={system} />
      <List disablePadding>
        <Typography variant="overline" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 1, color: 'text.subtle' }}>Tasks</Typography>
        <ListItemButton component="label" sx={{ gap: 1, px: 2, py: '5px' }} title="Deadlines from Lupira Tasks">
          <Checkbox size="small" sx={{ p: 0 }} checked={tasksVisible} onChange={toggleTasks} />
          <Box component="span" sx={{ width: 13, height: 13, borderRadius: '999px', border: 1, borderColor: 'border', flex: 'none', display: 'inline-block' }} style={{ background: 'var(--mui-palette-text-secondary)' }} />
          <Typography noWrap variant="body2">
            <NamedIcon name="schedule" sx={{ fontSize: 15, verticalAlign: -2, mr: 0.5 }} />
            Deadlines
          </Typography>
        </ListItemButton>
      </List>
    </Box>
  );
}

function CalendarGroup({ title, calendars }: { title: string; calendars: ContainerDto[] }) {
  const { isVisible, toggle } = useCalendarVisibility();
  if (calendars.length === 0) return null;
  return (
    <List disablePadding>
      <Typography variant="overline" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 1, color: 'text.subtle' }}>{title}</Typography>
      {calendars.map((c) => (
        <ListItemButton key={c.id} component="label" sx={{ gap: 1, px: 2, py: '5px' }} title={`${c.kind ?? ''} · ${c.access}`}>
          <Checkbox size="small" sx={{ p: 0 }} checked={isVisible(c)} onChange={() => toggle(c)} />
          <Box component="span" sx={{ width: 13, height: 13, borderRadius: '999px', border: 1, borderColor: 'border', flex: 'none', display: 'inline-block' }} style={{ background: calendarColor(c) }} />
          <Typography noWrap variant="body2">
            {c.kind && <KindIcon kind={c.kind} sx={{ fontSize: 15, verticalAlign: -2, mr: 0.5 }} />}
            {calendarLabel(c)}
          </Typography>
        </ListItemButton>
      ))}
    </List>
  );
}
