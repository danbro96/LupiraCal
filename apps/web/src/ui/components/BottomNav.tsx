import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import InboxIcon from '@mui/icons-material/Inbox';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import PeopleIcon from '@mui/icons-material/People';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';

const PRIMARY = [
  { to: '/', end: true, icon: <CalendarMonthIcon />, label: 'Calendar' },
  { to: '/items', icon: <SearchIcon />, label: 'Items' },
  { to: '/inbox', icon: <InboxIcon />, label: 'Inbox' },
  { to: '/contacts', icon: <PeopleIcon />, label: 'Contacts' },
];

const MORE = [
  { to: '/calendars', icon: <SettingsIcon />, label: 'Manage' },
];

/** Phone shell navigation; hidden on desktop. Secondary sections live behind "More". */
export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const path = useLocation().pathname;
  const primary = PRIMARY.find((t) => (t.end ? path === t.to : path.startsWith(t.to)));
  const value = primary?.to ?? (MORE.some((t) => path.startsWith(t.to)) ? 'more' : false);

  return (
    <>
      <Paper
        elevation={3}
        square
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          display: { md: 'none' },
          zIndex: 'appBar',
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <BottomNavigation showLabels value={value}>
          {PRIMARY.map((t) => (
            <BottomNavigationAction key={t.to} component={NavLink} to={t.to} value={t.to} label={t.label} icon={t.icon} />
          ))}
          <BottomNavigationAction value="more" label="More" icon={<MoreHorizIcon />} onClick={() => setMoreOpen(true)} />
        </BottomNavigation>
      </Paper>
      <SwipeableDrawer
        anchor="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onOpen={() => setMoreOpen(true)}
        disableSwipeToOpen
      >
        <List>
          {MORE.map((t) => (
            <ListItemButton key={t.to} component={NavLink} to={t.to} onClick={() => setMoreOpen(false)}>
              <ListItemIcon>{t.icon}</ListItemIcon>
              <ListItemText primary={t.label} />
            </ListItemButton>
          ))}
        </List>
      </SwipeableDrawer>
    </>
  );
}
