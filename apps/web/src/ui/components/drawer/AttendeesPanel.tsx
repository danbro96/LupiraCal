import { useState } from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CheckIcon from '@mui/icons-material/Check';
import ClearIcon from '@mui/icons-material/Clear';
import CloseIcon from '@mui/icons-material/Close';
import {
  useConfirmAttendance,
  useGetParticipationSummary,
  useInviteParticipant,
  useLeaveItem,
  useRemoveParticipant,
  useRespondToInvitation,
} from '@lupira/cal-api/query/cal';
import type { CalendarItemDto } from '@lupira/cal-api/models';
import { useSearchContacts } from '@lupira/cal-api/query/contact';
import { initialsOf } from '@lupira/cal-domain/contactNames';
import { rankByInteraction } from '@lupira/cal-domain/contactRank';
import { avatarColor } from '@lupira/cal-tokens/kinds';
import { useInvalidateItems } from '../../../state/useInvalidate';
import { errText } from '../../errText';
import { useSnackbar } from '../SnackbarHost';
import { WrapRow } from '../WrapRow';
import { DrawerSection } from '../DrawerSection';

const ROLE_OPTIONS = [
  { value: 'req-participant', label: 'Required' },
  { value: 'opt-participant', label: 'Optional' },
  { value: 'chair', label: 'Chair' },
  { value: 'non-participant', label: 'FYI' },
];

const ROLE_LABELS: Record<string, string> = {
  Chair: 'chair',
  RequiredParticipant: 'required',
  OptionalParticipant: 'optional',
  NonParticipant: 'fyi',
};

/** RSVP colour comes from the palette slots added for it, not a per-status class. */
const STATUS_COLOR: Record<string, string> = {
  Accepted: 'success.main',
  Declined: 'error.main',
  Tentative: 'warning.main',
};

const STATUS_LABELS: Record<string, string> = {
  NeedsAction: 'invited',
  Accepted: 'accepted',
  Declined: 'declined',
  Tentative: 'tentative',
  Delegated: 'delegated',
};

/** Invitees + RSVP state, with invite/respond/attend/leave/remove riding the participation events. */
export function AttendeesPanel({ item }: { item: CalendarItemDto }) {
  const invalidate = useInvalidateItems();
  const { data: contacts } = useSearchContacts();
  const contactName = (id?: string) => contacts?.find((c) => c.id === id)?.displayName ?? (id ?? '?').slice(0, 8);

  const showSnack = useSnackbar();
  const opts = { mutation: { onSuccess: invalidate, onError: (e: unknown) => showSnack(errText(e) ?? 'Request failed.') } };
  const invite = useInviteParticipant(opts);
  const respond = useRespondToInvitation(opts);
  const attend = useConfirmAttendance(opts);
  const leave = useLeaveItem(opts);
  const remove = useRemoveParticipant(opts);

  const [contactId, setContactId] = useState('');
  const [role, setRole] = useState('req-participant');

  // Most-met contacts first; fail-open — while the summary loads (or errors) the list stays alphabetical.
  const { data: summary } = useGetParticipationSummary();
  const invitable = rankByInteraction(
    (contacts ?? []).filter((c) => !item.attendees.some((a) => a.contactId === c.id)),
    summary,
  );

  return (
    <DrawerSection title="Attendees">
      {item.attendees.length === 0 && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">No attendees yet.</Typography>}
      {item.attendees.map((a) => {
        const pid = a.participationId ?? '';
        const status = a.status ?? 'NeedsAction';
        return (
          <Box key={pid} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: '6px', borderBottom: 1, borderColor: 'divider' }}>
            <Avatar sx={{ width: 30, height: 30, fontSize: 12, fontWeight: 700, color: 'common.white' }} style={{ background: avatarColor(a.contactId) }}>
              {initialsOf(contactName(a.contactId))}
            </Avatar>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span>{contactName(a.contactId)}</span>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {ROLE_LABELS[a.role ?? ''] ?? a.role} · <Box component="b" sx={{ color: STATUS_COLOR[status] }}>
                  {STATUS_LABELS[status] ?? status}
                </Box>
                {a.attendedAt ? ' · attended' : ''}
                {a.leftAt ? ' · left' : ''}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: '4px' }}>
              {status === 'NeedsAction' && (
                <>
                  <Tooltip title="Accept">
                    <Chip variant="outlined" icon={<CheckIcon />} onClick={() => respond.mutate({ id: item.id, participationId: pid, params: { status: 'accepted' } })} />
                  </Tooltip>
                  <Tooltip title="Tentative">
                    <Chip variant="outlined" label="?" onClick={() => respond.mutate({ id: item.id, participationId: pid, params: { status: 'tentative' } })} />
                  </Tooltip>
                  <Tooltip title="Decline">
                    <Chip variant="outlined" icon={<ClearIcon />} onClick={() => respond.mutate({ id: item.id, participationId: pid, params: { status: 'declined' } })} />
                  </Tooltip>
                </>
              )}
              {status === 'Accepted' && !a.attendedAt && (
                <Tooltip title="Confirm attendance">
                  <Chip variant="outlined" label="attended" onClick={() => attend.mutate({ id: item.id, participationId: pid })} />
                </Tooltip>
              )}
              {!a.leftAt && (
                <Tooltip title="Left">
                  <Chip variant="outlined" label="left" onClick={() => leave.mutate({ id: item.id, participationId: pid })} />
                </Tooltip>
              )}
              <Tooltip title="Remove">
                <IconButton onClick={() => remove.mutate({ id: item.id, participationId: pid })}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        );
      })}
      <WrapRow>
        <TextField select value={contactId} onChange={(e) => setContactId(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
          <MenuItem value="">Invite a contact…</MenuItem>
          {invitable.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.displayName}
            </MenuItem>
          ))}
        </TextField>
        <TextField select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_OPTIONS.map((r) => (
            <MenuItem key={r.value} value={r.value}>
              {r.label}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="outlined"
          disabled={!contactId || invite.isPending}
          onClick={() => {
            invite.mutate({ id: item.id, params: { contactId, role } });
            setContactId('');
          }}
        >
          Invite
        </Button>
      </WrapRow>
    </DrawerSection>
  );
}
