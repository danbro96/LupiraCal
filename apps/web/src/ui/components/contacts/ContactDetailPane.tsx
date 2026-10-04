import { useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useAddContactGroupMember,
  useDeleteContact,
  useGetContact,
  useListContactResidencies,
  useMoveContact,
  useRemoveContactGroupMember,
  useSetMyContact,
} from '@lupira/cal-api/query/contact';
import { useGetContactContext } from '@lupira/cal-api/query/bff-contacts';
import { visibleTags } from '@lupira/cal-domain/contactTiers';
import { channelLabel, reachLink } from '@lupira/cal-domain/reach';
import { addressMeta, splitAddresses } from '@danbro96/lupira-domain-contacts/residents';
import { fmtDate } from '@danbro96/lupira-domain-core/time';
import { addressBookLabel, useAddressBooks } from '../../../state/useAddressBooks';
import { useInvalidateContacts } from '../../../state/useInvalidate';
import { useMyContactId } from '../../../state/useMe';
import { CompletenessBadge } from '../drawer/CompletenessBadge';
import { errText } from '../../errText';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { PlaceTile } from '../places/PlaceTile';
import { EntryCodes } from '../places/EntryCodes';
import { useParentsHomes, useResidencyRows } from '../../../state/useResidencies';
import { useCopy } from '../../hooks/useCopy';
import { ContactCircles } from './ContactCircles';
import { ContactEditForm } from './ContactEditForm';
import { MoveDialog } from './MoveDialog';
import { ContactEventsPanel } from './ContactEventsPanel';
import { ContactRelationsPanel } from './ContactRelationsPanel';
import { fmtPartialDate } from '@lupira/cal-domain/partialDate';
import { deceasedLine } from '@danbro96/lupira-domain-contacts/contactNames';
import { WrapRow } from '../WrapRow';
import { DrawerSection } from '../DrawerSection';
import { PageHead } from '../Page';
import { DetailPane } from './panes';
import { BusinessIcon, CakeIcon, CopyIcon, GroupIcon, StarIcon } from '@danbro96/lupira-web-mui/icons';

const linkSx: SxProps<Theme> = { fontSize: 13, fontWeight: 600, p: '2px', whiteSpace: 'nowrap', '@media (pointer: coarse)': { p: '6px 2px' } };

/** Right pane for a contact: reach fields, postal addresses, profiles, emergency designation, group membership,
 *  completeness, and relations. Fields edit inline via ContactEditForm; all writes go over REST. */
export function ContactDetailPane() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const { data: contact, isLoading } = useGetContact(contactId ?? '', { query: { enabled: !!contactId } });
  // One BFF call, fired alongside the contact rather than after it: it resolves the address book id
  // server-side, so the groups and the emergency-contact names don't wait a round trip.
  const { data: context } = useGetContactContext(contactId ?? '', { query: { enabled: !!contactId } });
  const invalidate = useInvalidateContacts();
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const addMember = useAddContactGroupMember({ mutation: { onSuccess: invalidate, onError } });
  const removeMember = useRemoveContactGroupMember({ mutation: { onSuccess: invalidate, onError } });
  const del = useDeleteContact({ mutation: { onSuccess: () => { invalidate(); navigate('/contacts'); }, onError } });
  const setMe = useSetMyContact({ mutation: { onSuccess: invalidate, onError } });
  const { addressBooks } = useAddressBooks();
  // The server refuses to delete anyone's own contact; yours is the one this page can know.
  const isMe = useMyContactId() === contactId;
  const move = useMoveContact({
    mutation: {
      onSuccess: (moved) => {
        invalidate();
        navigate({ pathname: `/contacts/${moved.id}`, search: `?book=${moved.addressBookId}` });
      },
      onError,
    },
  });
  const [groupId, setGroupId] = useState('');
  const [editing, setEditing] = useState(false);
  const [showCircles, setShowCircles] = useState(false);
  const [showOtherAddresses, setShowOtherAddresses] = useState(false);
  const [moving, setMoving] = useState(false);
  const copy = useCopy();
  const { rows: residencyRows } = useResidencyRows();
  const { data: residencies } = useListContactResidencies(contactId ?? '', { query: { enabled: !!contactId } });
  const parentsHomes = useParentsHomes(contactId ?? null, residencyRows);

  if (isLoading) return <DetailPane><Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Loading…</Typography></DetailPane>;
  if (!contact) return <DetailPane><Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>Contact not found.</Typography></DetailPane>;

  const { current, other } = splitAddresses(residencyRows.filter((r) => r.contactId === contact.id).map((r) => ({ ...r, type: r.addressType })));
  const addresses = [...current, ...other];
  const memberOf = context?.memberOf ?? [];
  const joinable = context?.joinable ?? [];
  const groupSearch = `?book=${contact.addressBookId}`;
  const link = (id: string) => ({ pathname: `/contacts/${id}`, search: groupSearch });
  const nameOf = (cid: string) => context?.emergencyContacts.find((c) => c.id === cid)?.name ?? cid.slice(0, 8);

  return (
    <DetailPane>
      <PageHead>
        <h2>
          {contact.displayName}
          {contact.nickname && contact.nickname !== contact.displayName && <Typography variant="caption" sx={{ color: 'text.secondary' }}> “{contact.nickname}”</Typography>}
          {contact.deceased && (
            <Tooltip title={deceasedLine(contact.deathDate)}>
              <Chip variant="outlined" label="†" />
            </Tooltip>
          )}
        </h2>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CompletenessBadge score={contact.completeness} />
          {!editing && (
            <Button variant="outlined" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </Box>
      </PageHead>

      {editing ? (
        residencies ? <ContactEditForm contact={contact} residencies={residencies} onDone={() => setEditing(false)} /> : null
      ) : (
        <>
          <Box
      component="dl"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '8px 16px',
        m: 0,
        '& dt': { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.subtle' },
        '& dd': { m: 0, overflowWrap: 'anywhere' },
      }}
    >
            {contact.birthday && (
              <div>
                <dt>Birthday</dt>
                <dd><CakeIcon fontSize="small" sx={{ verticalAlign: -5, mr: 0.5 }} />{fmtPartialDate(contact.birthday)}</dd>
              </div>
            )}
            {contact.channels.map((c, i) => (
              <div key={i}>
                <dt>
                  {channelLabel(c.medium, c.type)}
                  {c.preferred && <StarIcon fontSize="small" sx={{ verticalAlign: -4, ml: 0.5 }} />}
                </dt>
                <dd>
                  <MuiLink underline="hover" sx={linkSx} href={reachLink(c.medium, c.value) ?? undefined}>
                    {c.value}
                  </MuiLink>
                  <CopyButton onCopy={() => copy(c.value, c.medium)} />
                </dd>
              </div>
            ))}
            {contact.profiles.map((p, i) => (
              <div key={i}>
                <dt>
                  {p.service}
                  {p.preferred && <StarIcon fontSize="small" sx={{ verticalAlign: -4, ml: 0.5 }} />}
                </dt>
                <dd>
                  {p.url || reachLink(p.service, p.handle) ? (
                    <MuiLink underline="hover" sx={linkSx} href={p.url || reachLink(p.service, p.handle) || undefined} target="_blank" rel="noreferrer">
                      {p.handle} ↗
                    </MuiLink>
                  ) : (
                    p.handle
                  )}
                  <CopyButton onCopy={() => copy(p.handle, p.service)} />
                </dd>
              </div>
            ))}
          </Box>

          {addresses.length + parentsHomes.length > 0 && (
            <DrawerSection title="Addresses" action={<Button variant="text" size="small" onClick={() => setMoving(true)}>Move…</Button>}>
              {current.map((a, i) => (
                <Box key={`now-${i}`}>
                  <PlaceTile placeId={a.placeId} meta={addressMeta(a)} />
                  <EntryCodes placeId={a.placeId} />
                </Box>
              ))}
              {parentsHomes.map((p) => (
                <Box key={`parents-${p.placeId}`}>
                  <PlaceTile placeId={p.placeId} meta={p.label} />
                  <EntryCodes placeId={p.placeId} />
                </Box>
              ))}
              {other.length > 0 && (
                <>
                  <Button variant="text" size="small" onClick={() => setShowOtherAddresses((v) => !v)}>
                    {showOtherAddresses ? 'Hide' : 'Show'} previous & upcoming ({other.length})
                  </Button>
                  {showOtherAddresses && other.map((a, i) => <PlaceTile key={`other-${i}`} placeId={a.placeId} meta={addressMeta(a)} muted />)}
                </>
              )}
            </DrawerSection>
          )}

          {moving && <MoveDialog contact={contact} rows={residencyRows} onClose={() => setMoving(false)} />}

          {contact.emergencyContactIds.length > 0 && (
            <DrawerSection title="Emergency contacts">
              {contact.emergencyContactIds.map((cid, i) => (
                <Box key={cid} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: '6px', borderBottom: 1, borderColor: 'divider' }}>
                  <Chip variant="outlined" label={i + 1} />
                  <MuiLink component={Link} sx={{ flex: 1 }} to={link(cid)}>
                    {nameOf(cid)}
                  </MuiLink>
                </Box>
              ))}
            </DrawerSection>
          )}
        </>
      )}

      <DrawerSection title="Groups">
        {memberOf.map((g) => (
          <Box key={g.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: '6px', borderBottom: 1, borderColor: 'divider' }}>
            <Chip variant="outlined" icon={g.kind === 'Organization' ? <BusinessIcon /> : <GroupIcon />} label={g.kind === 'Organization' ? 'org' : 'group'} />
            <MuiLink component={Link} sx={{ flex: 1 }} to={{ pathname: `/contacts/groups/${g.id}`, search: groupSearch }}>
              {g.name}
            </MuiLink>
            <Tooltip title="Remove from group">
              <IconButton
                onClick={() => removeMember.mutate({ groupId: g.id, contactId: contact.id })}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
        <WrapRow>
          <TextField select value={groupId} onChange={(e) => setGroupId(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value="">Add to group…</MenuItem>
            {joinable.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.name}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            disabled={!groupId}
            onClick={() => {
              addMember.mutate({ groupId, params: { contactId: contact.id } });
              setGroupId('');
            }}
          >
            Add
          </Button>
        </WrapRow>
      </DrawerSection>

      <ContactEventsPanel contactId={contact.id} />

      <DrawerSection title="Comms">
        <MuiLink component={Link} sx={linkSx} to={{ pathname: `/contacts/${contact.id}/topics`, search: groupSearch }}>
          Topics with {contact.displayName}
        </MuiLink>
      </DrawerSection>

      <ContactRelationsPanel contact={contact} />

      <DrawerSection
        title="Social circles"
        action={
          <Button variant="text" onClick={() => setShowCircles((v) => !v)}>
            {showCircles ? 'Hide' : 'Show'}
          </Button>
        }
      >
        {showCircles && <ContactCircles focusId={contact.id} />}
      </DrawerSection>

      {visibleTags(contact.tags).length > 0 && (
        <Typography variant="caption" component="p" sx={{ color: 'text.subtle', mt: 2 }}>
          {visibleTags(contact.tags).map((t) => `#${t}`).join('   ')}
        </Typography>
      )}
      {contact.updatedAt && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">
          Updated {fmtDate(new Date(contact.updatedAt))}
          {contact.createdAt && ` · added ${fmtDate(new Date(contact.createdAt))}`}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Button variant="text" disabled={setMe.isPending} onClick={() => setMe.mutate({ data: { contactId: contact.id } })}>
          This is me
        </Button>
        <TextField
          select
          label="Address book"
          value={contact.addressBookId}
          disabled={move.isPending || !addressBooks.some((b) => b.id === contact.addressBookId && writable(b.access))}
          onChange={(e) => move.mutate({ id: contact.id, data: { addressBookId: e.target.value } })}
        >
          {addressBooks
            .filter((b) => b.id === contact.addressBookId || writable(b.access))
            .map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {addressBookLabel(b)}
              </MenuItem>
            ))}
        </TextField>
        {!isMe && (
          <Button variant="outlined" color="error" onClick={() => del.mutate({ id: contact.id })} disabled={del.isPending}>
            Delete contact
          </Button>
        )}
      </Box>
    </DetailPane>
  );
}

const writable = (access: string) => access === 'Owner' || access === 'ReadWrite';

function CopyButton({ onCopy }: { onCopy: () => void }) {
  return (
    <Tooltip title="Copy">
      <IconButton size="small" onClick={onCopy} sx={{ ml: 0.5, p: '2px' }}>
        <CopyIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Tooltip>
  );
}

