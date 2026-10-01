import { useState } from 'react';
import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { useEnsureBootstrap } from '../../state/useContainers';
import { useEnsureContactBootstrap } from '../../state/useAddressBooks';
import { BottomNav } from './BottomNav';
import { CalendarVisibilityProvider } from './CalendarVisibility';
import { ItemDrawer } from './drawer/ItemDrawer';
import { BirthdayCard } from './drawer/BirthdayCard';
import { TaskCard } from './drawer/TaskCard';
import { AvailabilityModal } from './AvailabilityModal';
import { NewItemModal } from './NewItemModal';

const NAV = [
  { to: '/', label: 'Calendar', end: true },
  { to: '/items', label: 'Items' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/locations', label: 'Map' },
  { to: '/photos', label: 'Photos' },
  { to: '/calendars', label: 'Manage' },
];

// NavLink sets .active itself, so the current section needs no state.
// textTransform because Button uppercases, which is an affordance for actions, not for nav labels.
const NAV_LINK_SX = {
  color: 'text.secondary',
  fontWeight: 600,
  textTransform: 'none',
  '&.active': { bgcolor: 'background.paper', color: 'text.primary' },
};

/** Full-width app frame: section nav, calendar sidebar, routed content, and the ?item= drawer host. */
export function AppShell() {
  useEnsureBootstrap();
  useEnsureContactBootstrap();
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [settingAvailability, setSettingAvailability] = useState(false);
  const itemId = searchParams.get('item');
  const birthdayContactId = searchParams.get('birthday');
  const birthdayYear = searchParams.get('year');
  // ?task=<listId>:<itemId> — the tasks API addresses items list-scoped, so the ref carries both GUIDs.
  const [taskListId, taskItemId] = (searchParams.get('task') ?? '').split(':');

  const dropParams = (...keys: string[]) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const k of keys) next.delete(k);
      return next;
    });

  return (
    <CalendarVisibilityProvider>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <AppBar
          position="static"
          color="transparent"
          elevation={0}
          sx={{ display: { xs: 'none', md: 'block' }, borderBottom: 1, borderColor: 'divider' }}
        >
          <Toolbar variant="dense">
            <Stack component="nav" direction="row" spacing={1} sx={{ flex: 1 }}>
              {NAV.map(({ to, label, end }) => (
                <Button key={to} component={NavLink} to={to} end={end} sx={NAV_LINK_SX}>
                  {label}
                </Button>
              ))}
            </Stack>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </Box>
        <Box
          sx={{
            position: 'fixed',
            right: 16,
            bottom: { xs: 'calc(56px + env(safe-area-inset-bottom) + 12px)', md: 16 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            zIndex: 'fab',
          }}
        >
          <Tooltip title="Set availability">
            <Fab size="small" onClick={() => setSettingAvailability(true)} aria-label="Set availability">
              <EventAvailableIcon fontSize="small" />
            </Fab>
          </Tooltip>
          <Tooltip title="New item">
            <Fab color="primary" onClick={() => setCreating(true)} aria-label="New item">
              <AddIcon />
            </Fab>
          </Tooltip>
        </Box>
        <BottomNav />
      </Box>
      {itemId && <ItemDrawer itemId={itemId} onClose={() => dropParams('item')} />}
      {birthdayContactId && (
        <BirthdayCard contactId={birthdayContactId} year={birthdayYear} onClose={() => dropParams('birthday', 'year')} />
      )}
      {taskListId && taskItemId && <TaskCard listId={taskListId} itemId={taskItemId} onClose={() => dropParams('task')} />}
      {creating && <NewItemModal onClose={() => setCreating(false)} />}
      {settingAvailability && <AvailabilityModal onClose={() => setSettingAvailability(false)} />}
    </CalendarVisibilityProvider>
  );
}
