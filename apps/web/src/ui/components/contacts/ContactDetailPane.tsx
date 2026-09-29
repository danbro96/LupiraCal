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
  useRemoveContactGroupMember,
  useSetMyContact,
} from '@lupira/cal-api/query/contact';
import { useGetContactContext } from '@lupira/cal-api/query/bff-contacts';
import { visibleTags } from '@lupira/cal-domain/contactTiers';
import { fmtResidencyPeriod, residencyStatus, type FuzzyDate } from '@lupira/cal-domain/fuzzyDate';

function residencySuffix(movedIn: FuzzyDate | null | undefined, movedOut: FuzzyDate | null | undefined): string {
  const status = residencyStatus(movedIn, movedOut);
  return status === 'former' ? ' (former)' : status === 'future' ? ' (upcoming)' : '';
}
import { fmtDate } from '@lupira/cal-domain/time';
import { useInvalidateContacts } from '../../../state/useInvalidate';
import { CompletenessBadge } from '../drawer/CompletenessBadge';
import { errText } from '../../errText';
import { useSnackbar } from '../SnackbarHost';
import { PlaceLabel } from '../places/PlaceLabel';
import { ContactCircles } from './ContactCircles';
import { ContactEditForm } from './ContactEditForm';
import { ContactEventsPanel } from './ContactEventsPanel';
import { ContactRelationsPanel } from './ContactRelationsPanel';
import { fmtPartialDate } from '@lupira/cal-domain/partialDate';
import { WrapRow } from '../WrapRow';
import { DrawerSection } from '../DrawerSection';
import { PageHead } from '../Page';
import { DetailPane } from './panes';
import { BusinessIcon, CakeIcon, GroupIcon, PlaceIcon, StarIcon } from '../../icons';

const linkSx: SxProps<Theme> = { fontSize: 13, fontWeight: 600, p: '2px', whiteSpace: 'nowrap', '@media (pointer: coarse)': { p: '6px 2px' } };

/** Right pane for a contact: reach fields, postal addresses, profiles, emergency designation, group membership,
 *  completeness, and relations. Fields edit inline via ContactEditForm; all writes go over REST. */
export function ContactDetailPane() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const { data: contact, isLoading } = useGetContact(contactId ?? '', { query: { enabled: !!contactId } });
  // One BFF call, fired alongside the contact rather than after it: it resolves the address book id
  // server-side, so the groups and the emergency-contact names no longer wait a round trip.
  const { data: context } = useGetContactContext(contactId ?? '', { query: { enabled: !!contactId } });
  const invalidate = useInvalidateContacts();
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const addMember = useAddContactGroupMember({ mutation: { onSuccess: invalidate, onError } });
  const removeMember = useRemoveContactGroupMember({ mutation: { onSuccess: invalidate, onError } });
  const del = useDeleteContact({ mutation: { onSuccess: () => { invalidate(); navigate('/contacts'); }, onError } });
  const setMe = useSetMyContact({ mutation: { onSuccess: invalidate, onError } });
  const [groupId, setGroupId] = useState('');
  const [editing, setEditing] = useState(false);
  const [showCircles, setShowCircles] = useState(false);

  if (isLoading) return <DetailPane><Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Loading…</Typography></DetailPane>;
  if (!contact) return <DetailPane><Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>Contact not found.</Typography></DetailPane>;

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
            <Tooltip title={contact.deathDate ? `died ${contact.deathDate}` : 'deceased'}>
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
        <ContactEditForm contact={contact} onDone={() => setEditing(false)} />
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
                  {c.type || c.medium}
                  {c.preferred && <StarIcon fontSize="small" sx={{ verticalAlign: -4, ml: 0.5 }} />}
                </dt>
                <dd>
                  <MuiLink underline="hover" sx={linkSx} href={`${c.medium === 'Phone' ? 'tel' : 'mailto'}:${c.value}`}>
                    {c.value}
                  </MuiLink>
                </dd>
              </div>
            ))}
            {contact.addresses.filter((a) => a.placeId).map((a, i) => (
              <div key={i}>
                <dt>{a.type} address</dt>
                <dd>
                  <PlaceIcon fontSize="small" sx={{ verticalAlign: -5, mr: 0.5 }} /> <PlaceLabel placeId={a.placeId} link />
                  {(a.movedIn || a.movedOut) && (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}> · {fmtResidencyPeriod(a.movedIn, a.movedOut)}{residencySuffix(a.movedIn, a.movedOut)}</Typography>
                  )}
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
                  {p.url ? (
                    <MuiLink underline="hover" sx={linkSx} href={p.url} target="_blank" rel="noreferrer">
                      {p.handle} ↗
                    </MuiLink>
                  ) : (
                    p.handle
                  )}
                </dd>
              </div>
            ))}
          </Box>

          {visibleTags(contact.tags).length > 0 && (
            <WrapRow>
              {visibleTags(contact.tags).map((t) => (
                <Chip key={t} label={t} />
              ))}
            </WrapRow>
          )}

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

      {contact.updatedAt && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">
          Updated {fmtDate(new Date(contact.updatedAt))}
          {contact.createdAt && ` · added ${fmtDate(new Date(contact.createdAt))}`}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, justifyContent: 'space-between' }}>
        <Button variant="text" disabled={setMe.isPending} onClick={() => setMe.mutate({ data: { contactId: contact.id } })}>
          This is me
        </Button>
        <Button variant="outlined" color="error" onClick={() => del.mutate({ id: contact.id })} disabled={del.isPending}>
          Delete contact
        </Button>
      </Box>
    </DetailPane>
  );
}
