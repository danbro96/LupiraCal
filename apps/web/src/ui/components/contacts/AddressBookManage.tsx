import { useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import {
  useDeleteAddressBook,
  useGrantAddressBookOwner,
  useListAddressBookOwners,
  useRevokeAddressBookOwner,
  useUpdateAddressBook,
} from '@lupira/cal-api/query/contact';
import type { AddressBookDto } from '@lupira/cal-api/models';
import { useInvalidateAddressBooks } from '../../../state/useInvalidate';
import { errText } from '../../errText';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';

const ACCESS_OPTIONS = [
  { value: 'read', label: 'Read' },
  { value: 'read-write', label: 'Read-write' },
  { value: 'owner', label: 'Owner' },
];

/** Owner-only management for one address book: rename, share (grant/revoke co-owners), delete.
 *  Delete is refused server-side for the personal book or a non-empty book — the 409 surfaces as a snackbar. */
export function AddressBookManage({ book, onDeleted }: { book: AddressBookDto; onDeleted: () => void }) {
  const invalidate = useInvalidateAddressBooks();
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const update = useUpdateAddressBook({ mutation: { onSuccess: invalidate, onError } });
  const del = useDeleteAddressBook({ mutation: { onSuccess: () => { invalidate(); onDeleted(); }, onError } });
  const grant = useGrantAddressBookOwner({ mutation: { onSuccess: invalidate, onError } });
  const revoke = useRevokeAddressBookOwner({ mutation: { onSuccess: invalidate, onError } });
  const { data: owners } = useListAddressBookOwners(book.id);

  const [displayName, setDisplayName] = useState(book.displayName ?? '');
  const [slug, setSlug] = useState(book.slug);
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState('read');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: '8px 36px 12px', borderLeft: 2, borderColor: 'border', ml: 2 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ addressBookId: book.id, data: { slug: slug.trim() || null, displayName: displayName.trim() || null } });
        }}
      >
        <TextField placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <TextField placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <Button variant="outlined" type="submit" disabled={update.isPending}>
          Rename
        </Button>
      </form>

      <Typography variant="overline" component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 2, pb: 1, color: 'text.subtle' }}>Shared with</Typography>
      {(owners ?? []).map((o) => (
        <Box key={o.principalId} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: '6px', borderBottom: 1, borderColor: 'divider' }}>
          <Chip variant="outlined" label={o.access} />
          <Box component="span" sx={{ flex: 1 }}>{o.displayName ?? o.email}</Box>
          <Tooltip title="Revoke access">
            <IconButton
              disabled={revoke.isPending}
              onClick={() => revoke.mutate({ addressBookId: book.id, params: { email: o.email } })}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          grant.mutate({ addressBookId: book.id, data: { email: email.trim(), access } });
          setEmail('');
        }}
      >
        <TextField type="email" placeholder="email to share with" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField select value={access} onChange={(e) => setAccess(e.target.value)}>
          {ACCESS_OPTIONS.map((a) => (
            <MenuItem key={a.value} value={a.value}>
              {a.label}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" type="submit" disabled={!email.trim() || grant.isPending}>
          Share
        </Button>
      </form>

      <Button variant="outlined" color="error" disabled={del.isPending} onClick={() => del.mutate({ addressBookId: book.id })}>
        Delete address book
      </Button>
    </Box>
  );
}
