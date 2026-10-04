import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { logout } from '@danbro96/lupira-web-session/session';
import { useSession } from '@danbro96/lupira-web-session/useSession';
import { useCreateCalendar, useGrantCalendarOwner, useRevokeCalendarOwner } from '@lupira/cal-api/query/cal';
import { CalendarClass, CalendarKind, type ContainerDto } from '@lupira/cal-api/models';
import { useCreateAddressBook, useGrantAddressBookOwner, useRevokeAddressBookOwner } from '@lupira/cal-api/query/contact';
import type { AddressBookDto } from '@lupira/cal-api/models';
import { deviceTimeZone } from '@lupira/cal-domain/zonedTime';
import { KIND_COLORS } from '@danbro96/lupira-tokens-calendar/kinds';
import { calendarLabel, useContainers } from '../../state/useContainers';
import { addressBookLabel, useAddressBooks } from '../../state/useAddressBooks';
import { useInvalidateAddressBooks, useInvalidateContainers } from '../../state/useInvalidate';
import { calendarColor } from '../theme/kinds';
import { KindIcon } from '../components/KindIcon';
import { errText } from '../errText';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { WrapRow } from '../components/WrapRow';
import { Page } from '../components/Page';
import { PageHead } from '../components/Page';
import { ContactsIcon } from '@danbro96/lupira-web-mui/icons';

/** Container management: calendars (class/kind/color/tz, from cal-api) and address books (from
 *  contact-api), with creation and per-owner sharing. */
export function CalendarsScreen() {
  const { calendars } = useContainers();
  const { addressBooks } = useAddressBooks();
  const { data: user } = useSession();
  const [creating, setCreating] = useState(false);

  return (
    <Page>
      <Paper
        variant="outlined"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, p: '12px 16px', mb: 2 }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{user?.name ?? user?.email}</Typography>
          {user?.name && user?.email && user.name !== user.email && (
            <Typography variant="body2" sx={{ color: 'text.subtle' }}>
              {user.email}
            </Typography>
          )}
        </Box>
        <Button variant="outlined" onClick={logout}>
          Sign out
        </Button>
      </Paper>
      <PageHead>
        <h2>Calendars & address books</h2>
        <Button variant="contained" onClick={() => setCreating((c) => !c)}>
          + New
        </Button>
        <Button component={NavLink} to="/places">
          Places…
        </Button>
      </PageHead>
      {creating && <NewContainerForm onDone={() => setCreating(false)} />}
      <Table sx={{ mt: 1.5 }}>
        <TableHead>
          <TableRow>
            <TableCell />
            <TableCell>Name</TableCell>
            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Slug</TableCell>
            <TableCell>Class</TableCell>
            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Kind</TableCell>
            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Timezone</TableCell>
            <TableCell>Access</TableCell>
            <TableCell>Sharing</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {calendars.map((c) => (
            <CalendarRow key={c.id} c={c} />
          ))}
          {addressBooks.map((b) => (
            <BookRow key={b.id} b={b} />
          ))}
        </TableBody>
      </Table>
    </Page>
  );
}

function CalendarRow({ c }: { c: ContainerDto }) {
  const [sharing, setSharing] = useState(false);
  return (
    <>
      <TableRow>
        <TableCell>
          <Box component="span" sx={{ width: 13, height: 13, borderRadius: '999px', border: 1, borderColor: 'border', flex: 'none', display: 'inline-block' }} style={{ background: calendarColor(c) }} />
        </TableCell>
        <TableCell>
          {c.kind && <KindIcon kind={c.kind} sx={{ fontSize: 15, verticalAlign: -2, mr: 0.5 }} />}
          {calendarLabel(c)}
        </TableCell>
        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
          <code>{c.slug}</code>
        </TableCell>
        <TableCell>{c.class && <Chip variant="outlined" label={c.class} />}</TableCell>
        <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', md: 'table-cell' } }}>{c.kind ?? '—'}</TableCell>
        <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', md: 'table-cell' } }}>{c.defaultTimezone ?? '—'}</TableCell>
        <TableCell sx={{ color: 'text.secondary' }}>{c.access}</TableCell>
        <TableCell>
          {c.access === 'Owner' && (
            <Button variant="text" onClick={() => setSharing((s) => !s)}>
              {sharing ? 'close' : 'share…'}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {sharing && (
        <TableRow>
          <TableCell colSpan={8}>
            <SharePanel kind="calendar" id={c.id} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function BookRow({ b }: { b: AddressBookDto }) {
  const [sharing, setSharing] = useState(false);
  return (
    <>
      <TableRow>
        <TableCell>
          <Box component="span" sx={{ width: 13, height: 13, borderRadius: '999px', border: 1, borderColor: 'border', flex: 'none', display: 'inline-block' }} style={{ background: 'var(--mui-palette-border)' }} />
        </TableCell>
        <TableCell><ContactsIcon fontSize="small" sx={{ verticalAlign: -5, mr: 0.75 }} />{addressBookLabel(b)}</TableCell>
        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
          <code>{b.slug}</code>
        </TableCell>
        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>—</TableCell>
        <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', md: 'table-cell' } }}>—</TableCell>
        <TableCell sx={{ color: 'text.secondary', display: { xs: 'none', md: 'table-cell' } }}>—</TableCell>
        <TableCell sx={{ color: 'text.secondary' }}>{b.access}</TableCell>
        <TableCell>
          {b.access === 'Owner' && (
            <Button variant="text" onClick={() => setSharing((s) => !s)}>
              {sharing ? 'close' : 'share…'}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {sharing && (
        <TableRow>
          <TableCell colSpan={8}>
            <SharePanel kind="book" id={b.id} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** Grant/revoke by email. The API has no owner-list endpoint, so this is action-only. Calendars
 *  share via cal-api owners, address books via contact-api owners. */
function SharePanel({ kind, id }: { kind: 'calendar' | 'book'; id: string }) {
  const invalidateContainers = useInvalidateContainers();
  const invalidateBooks = useInvalidateAddressBooks();
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const calOpts = { mutation: { onSuccess: invalidateContainers, onError } };
  const bookOpts = { mutation: { onSuccess: invalidateBooks, onError } };
  const grantCal = useGrantCalendarOwner(calOpts);
  const revokeCal = useRevokeCalendarOwner(calOpts);
  const grantBook = useGrantAddressBookOwner(bookOpts);
  const revokeBook = useRevokeAddressBookOwner(bookOpts);
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState('read-write');

  const isCalendar = kind === 'calendar';
  const grant = isCalendar ? grantCal : grantBook;
  const revoke = isCalendar ? revokeCal : revokeBook;

  return (
    <WrapRow sx={{ p: 1, my: 0, bgcolor: 'background.paper', borderRadius: 1 }}>
      <TextField type="email" placeholder="member@email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField select value={access} onChange={(e) => setAccess(e.target.value)}>
        <MenuItem value="owner">Owner</MenuItem>
        <MenuItem value="read-write">Read-write</MenuItem>
        <MenuItem value="read">Read</MenuItem>
      </TextField>
      <Button
        variant="outlined"
        disabled={!email}
        onClick={() =>
          isCalendar
            ? grantCal.mutate({ calendarId: id, data: { email, access } })
            : grantBook.mutate({ addressBookId: id, data: { email, access } })
        }
      >
        Grant
      </Button>
      <Button
        variant="outlined"
        color="error"
        disabled={!email}
        onClick={() =>
          isCalendar
            ? revokeCal.mutate({ calendarId: id, params: { email } })
            : revokeBook.mutate({ addressBookId: id, params: { email } })
        }
      >
        Revoke
      </Button>
      {(grant.isPending || revoke.isPending) && <Typography variant="caption" sx={{ color: 'text.secondary' }}>…</Typography>}
    </WrapRow>
  );
}

function NewContainerForm({ onDone }: { onDone: () => void }) {
  const invalidateContainers = useInvalidateContainers();
  const invalidateBooks = useInvalidateAddressBooks();
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const createCal = useCreateCalendar({ mutation: { onSuccess: () => { invalidateContainers(); onDone(); }, onError } });
  const createBook = useCreateAddressBook({ mutation: { onSuccess: () => { invalidateBooks(); onDone(); }, onError } });
  const [form, setForm] = useState({
    type: 'calendar',
    slug: '',
    displayName: '',
    color: KIND_COLORS.Personal,
    defaultTimezone: deviceTimeZone() ?? 'UTC',
    class: 'Agenda' as CalendarClass,
    kind: 'Generic' as CalendarKind,
  });

  const isBook = form.type === 'addressbook';
  const pending = createCal.isPending || createBook.isPending;

  return (
    <Paper variant="outlined" component="form" sx={{ p: '12px 16px', my: 1.5 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (isBook) {
          createBook.mutate({ data: { slug: form.slug, displayName: form.displayName || null } });
        } else {
          createCal.mutate({
            data: {
              type: 'calendar',
              slug: form.slug,
              displayName: form.displayName || null,
              color: form.color,
              defaultTimezone: form.defaultTimezone || null,
              class: form.class,
              kind: form.kind,
            },
          });
        }
      }}
    >
      <WrapRow>
        <TextField select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <MenuItem value="calendar">Calendar</MenuItem>
          <MenuItem value="addressbook">Address book</MenuItem>
        </TextField>
        <TextField placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
        <TextField placeholder="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      </WrapRow>
      {!isBook && (
        <WrapRow>
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} title="Color" />
          <TextField placeholder="IANA timezone" value={form.defaultTimezone} onChange={(e) => setForm({ ...form, defaultTimezone: e.target.value })} />
          <TextField select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value as CalendarClass })}>
            {Object.values(CalendarClass).map((v) => (
              <MenuItem key={v} value={v}>
                {v}
              </MenuItem>
            ))}
          </TextField>
          <TextField select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CalendarKind })}>
            {Object.values(CalendarKind).map((v) => (
              <MenuItem key={v} value={v}>
                {v}
              </MenuItem>
            ))}
          </TextField>
        </WrapRow>
      )}
      <WrapRow>
        <Button variant="contained" type="submit" disabled={pending}>
          Create
        </Button>
        <Button variant="outlined" type="button" onClick={onDone}>
          Cancel
        </Button>
      </WrapRow>
    </Paper>
  );
}
