import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SettingsIcon from '@mui/icons-material/Settings';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import {
  useCreateAddressBook,
  useCreateContactGroup,
  useGetMe,
  useListContactGroups,
  useSearchContacts,
} from '@lupira/cal-api/query/contact';
import type { AddressBookDto } from '@lupira/cal-api/models';
import { addressBookLabel, useAddressBooks } from '../../../state/useAddressBooks';
import { useInvalidateAddressBooks, useInvalidateContacts } from '../../../state/useInvalidate';
import { AddressBookManage } from './AddressBookManage';
import { WrapRow } from '../WrapRow';
import { SidePane } from './panes';
import { BusinessIcon, ContactsIcon, GroupIcon, PersonIcon } from '@danbro96/lupira-web-mui/icons';

const COUNT_SX = { flex: 'none', fontSize: 12, color: 'text.subtle', fontVariantNumeric: 'tabular-nums' } as const;
// Forms and the add buttons align with the group rows, one caret-width in.
const ADD_SX = { display: 'flex', flexDirection: 'column', gap: '4px', p: '4px 36px 8px' } as const;

/** Left rail: address books → their groups/orgs, with contact and member counts.
 *  Book click filters the list (?book); group click opens the group pane + filters to members. */
export function ContactsTree() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const activeBookId = params.get('book') ?? '';
  const activeGroupId = useMatch('/contacts/groups/:groupId')?.params.groupId ?? '';
  const openContactId = useMatch('/contacts/:contactId')?.params.contactId ?? '';
  const { addressBooks } = useAddressBooks();
  const { data: allContacts } = useSearchContacts({});
  const { data: me } = useGetMe();
  const [addingBook, setAddingBook] = useState(false);

  const countFor = (bookId: string) => (allContacts ?? []).filter((c) => c.addressBookId === bookId).length;

  return (
    <SidePane width={240} component="aside">
      {me?.contactId ? (
        <ListItemButton
          selected={openContactId === me.contactId}
          onClick={() => navigate(`/contacts/${me.contactId}`)}
          sx={{ borderBottom: 1, borderColor: 'border', mb: 0.5, fontWeight: 600 }}
        >
          <ListItemText primary={<><PersonIcon fontSize="small" sx={{ verticalAlign: -5, mr: 0.75 }} />{me.displayName || 'You'}</>} slotProps={{ primary: { noWrap: true } }} />
          {me.displayName && <Chip variant="outlined" label="You" />}
        </ListItemButton>
      ) : (
        me &&
        (allContacts?.length ?? 0) > 0 && (
          <Box sx={ADD_SX}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Open your card → “This is me” to pin it here.</Typography>
          </Box>
        )
      )}
      <Typography variant="overline" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 1, color: 'text.subtle' }}>Address books</Typography>
      <ListItemButton
        selected={!activeBookId && !activeGroupId}
        onClick={() => navigate('/contacts?pane=list')}
        sx={{ pl: '36px' }}
      >
        <ListItemText primary="All contacts" slotProps={{ primary: { noWrap: true } }} />
        <Box component="span" sx={COUNT_SX}>{allContacts?.length ?? '·'}</Box>
      </ListItemButton>

      {addressBooks.map((book) => (
        <BookNode
          key={book.id}
          book={book}
          count={countFor(book.id)}
          activeBookId={activeBookId}
          activeGroupId={activeGroupId}
        />
      ))}

      {addingBook ? (
        <NewBookForm onDone={() => setAddingBook(false)} />
      ) : (
        <Box sx={ADD_SX}>
          <Button variant="text" onClick={() => setAddingBook(true)}>
            + Address book
          </Button>
        </Box>
      )}
    </SidePane>
  );
}

function BookNode({
  book,
  count,
  activeBookId,
  activeGroupId,
}: {
  book: AddressBookDto;
  count: number;
  activeBookId: string;
  activeGroupId: string;
}) {
  const navigate = useNavigate();
  const isActive = activeBookId === book.id;
  const [expanded, setExpanded] = useState(() => isActive);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const { data: groups } = useListContactGroups(book.id, { query: { enabled: expanded } });

  return (
    <>
      <ListItem disablePadding sx={{ pr: 1 }}>
        <IconButton
          onClick={() => setExpanded((x) => !x)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
          sx={{ ml: 0.5 }}
        >
          {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
        <ListItemButton selected={isActive} onClick={() => navigate(`/contacts?book=${book.id}`)}>
          <ListItemText primary={<><ContactsIcon fontSize="small" sx={{ verticalAlign: -5, mr: 0.75 }} />{addressBookLabel(book)}</>} slotProps={{ primary: { noWrap: true } }} />
        </ListItemButton>
        {book.access === 'Owner' && (
          <IconButton onClick={() => setManaging((x) => !x)} title="Manage address book" aria-label="Manage address book">
            <SettingsIcon fontSize="small" />
          </IconButton>
        )}
        <Box component="span" sx={COUNT_SX}>{count}</Box>
      </ListItem>

      {managing && (
        <AddressBookManage
          book={book}
          onDeleted={() => {
            setManaging(false);
            navigate('/contacts');
          }}
        />
      )}

      <Collapse in={expanded} unmountOnExit>
        <List disablePadding>
          {(groups ?? []).map((g) => (
            <ListItemButton
              key={g.id}
              selected={activeGroupId === g.id}
              onClick={() => navigate(`/contacts/groups/${g.id}?book=${book.id}`)}
              sx={{ pl: '36px' }}
            >
              <ListItemText
                primary={<>{g.kind === 'Organization' ? <BusinessIcon fontSize="small" sx={{ verticalAlign: -5, mr: 0.75 }} /> : <GroupIcon fontSize="small" sx={{ verticalAlign: -5, mr: 0.75 }} />}{g.name}</>}
                slotProps={{ primary: { noWrap: true } }}
              />
              <Box component="span" sx={COUNT_SX}>{g.members.length}</Box>
            </ListItemButton>
          ))}
          {adding ? (
            <NewGroupForm addressBookId={book.id} onDone={() => setAdding(false)} />
          ) : (
            <Box sx={ADD_SX}>
              <Button variant="text" onClick={() => setAdding(true)}>
                + group
              </Button>
            </Box>
          )}
        </List>
      </Collapse>
    </>
  );
}

function NewGroupForm({ addressBookId, onDone }: { addressBookId: string; onDone: () => void }) {
  const invalidate = useInvalidateContacts();
  const create = useCreateContactGroup({ mutation: { onSuccess: () => { invalidate(); onDone(); } } });
  const [name, setName] = useState('');
  const [kind, setKind] = useState('group');

  return (
    <Box
      component="form"
      sx={ADD_SX}
      onSubmit={(e) => {
        e.preventDefault();
        if (name) create.mutate({ addressBookId, params: { name, kind } });
      }}
    >
      <TextField placeholder="Group name…" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <TextField select value={kind} onChange={(e) => setKind(e.target.value)}>
        <MenuItem value="group">Group</MenuItem>
        <MenuItem value="organization">Organization</MenuItem>
      </TextField>
      <WrapRow>
        <Button variant="outlined" type="submit" disabled={!name || create.isPending}>
          Add
        </Button>
        <Button variant="outlined" onClick={onDone}>
          Cancel
        </Button>
      </WrapRow>
    </Box>
  );
}

function NewBookForm({ onDone }: { onDone: () => void }) {
  const invalidate = useInvalidateAddressBooks();
  const create = useCreateAddressBook({ mutation: { onSuccess: () => { invalidate(); onDone(); } } });
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');

  return (
    <Box
      component="form"
      sx={ADD_SX}
      onSubmit={(e) => {
        e.preventDefault();
        if (slug) create.mutate({ data: { slug, displayName: displayName || null } });
      }}
    >
      <TextField placeholder="slug" value={slug} autoFocus onChange={(e) => setSlug(e.target.value)} />
      <TextField placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <WrapRow>
        <Button variant="outlined" type="submit" disabled={!slug || create.isPending}>
          Add
        </Button>
        <Button variant="outlined" onClick={onDone}>
          Cancel
        </Button>
      </WrapRow>
    </Box>
  );
}
