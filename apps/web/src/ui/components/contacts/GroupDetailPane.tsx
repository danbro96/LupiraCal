import { useState } from 'react';
import Avatar from '@mui/material/Avatar';
import { initialsOf } from '@danbro96/lupira-domain-contacts/contactNames';
import { avatarColor } from '@danbro96/lupira-tokens-calendar/kinds';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import MuiLink from '@mui/material/Link';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useAddContactGroupMember,
  useDeleteContactGroup,
  useRemoveContactGroupMember,
  useRenameContactGroup,
  useSearchContacts,
} from '@lupira/cal-api/query/contact';
import type { ContactDto } from '@lupira/cal-api/models';
import { matchesTerms, searchTerms } from '@danbro96/lupira-domain-core/textSearch';
import { useInvalidateContacts } from '../../../state/useInvalidate';
import { useGroup } from './useGroup';
import { DrawerSection } from '../DrawerSection';
import { PageHead } from '../Page';
import { DetailPane } from './panes';
import { BusinessIcon, GroupIcon } from '@danbro96/lupira-web-mui/icons';

/** Right pane for a group/org: members with add/remove, inline rename, delete. */
export function GroupDetailPane() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidateContacts();
  const { group, isLoading } = useGroup(groupId);
  // Members can live in any book you can read — the group only belongs to one.
  const { data: readable } = useSearchContacts({});

  const rename = useRenameContactGroup({ mutation: { onSuccess: invalidate } });
  const del = useDeleteContactGroup({ mutation: { onSuccess: () => Promise.all([invalidate(), navigate('/contacts')]) } });
  const addMember = useAddContactGroupMember({ mutation: { onSuccess: invalidate } });
  const removeMember = useRemoveContactGroupMember({ mutation: { onSuccess: invalidate } });
  const [addKey, setAddKey] = useState(0);

  if (!group) {
    return (
      <DetailPane>
        <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>
          {isLoading ? 'Loading…' : 'Group not found.'}
        </Typography>
      </DetailPane>
    );
  }

  const memberIds = new Set(group.members.map((m) => m.contactId));
  const members = (readable ?? []).filter((c) => memberIds.has(c.id));
  const nonMembers = (readable ?? []).filter((c) => !memberIds.has(c.id));
  const unreadable = readable ? group.members.length - members.length : 0;

  return (
    <DetailPane>
      <PageHead>
        <h2>
          <Chip variant="outlined" icon={group.kind === 'Organization' ? <BusinessIcon /> : <GroupIcon />} label={group.kind === 'Organization' ? 'org' : 'group'} />{' '}
          <TextField
            variant="standard"
            defaultValue={group.name}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== group.name)
                rename.mutate({ groupId: group.id, params: { name: e.target.value } });
            }}
          />
        </h2>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {group.members.length} members{unreadable > 0 && ` · ${unreadable} in books you can't open`}
        </Typography>
      </PageHead>

      <DrawerSection title="Members">
        {members.map((c) => (
          <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: '6px', borderBottom: 1, borderColor: 'divider' }}>
            <Avatar sx={{ width: 30, height: 30, fontSize: 12, fontWeight: 700, color: 'common.white' }} style={{ background: avatarColor(c.id) }}>
              {initialsOf(c.displayName)}
            </Avatar>
            <MuiLink component={Link} sx={{ flex: 1 }} to={{ pathname: `/contacts/${c.id}`, search: `?book=${c.addressBookId}` }}>
              {c.displayName}
            </MuiLink>
            <Tooltip title="Remove from group">
              <IconButton
                onClick={() => removeMember.mutate({ groupId: group.id, contactId: c.id })}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
        {members.length === 0 && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">No members yet.</Typography>}
        <Autocomplete
          key={addKey}
          sx={{ mt: 1, maxWidth: 360 }}
          options={nonMembers}
          getOptionLabel={(c) => c.displayName}
          filterOptions={(options, { inputValue }) => filterContacts(options, inputValue)}
          onChange={(_, c) => {
            if (!c) return;
            addMember.mutate({ groupId: group.id, params: { contactId: c.id } });
            setAddKey((n) => n + 1);
          }}
          renderInput={(params) => <TextField {...params} placeholder="Add member…" />}
        />
      </DrawerSection>

      <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button variant="outlined" color="error" onClick={() => del.mutate({ groupId: group.id })} disabled={del.isPending}>
          Delete {group.kind === 'Organization' ? 'organization' : 'group'}
        </Button>
      </Box>
    </DetailPane>
  );
}

function filterContacts(options: ContactDto[], input: string): ContactDto[] {
  const terms = searchTerms(input);
  return options.filter((c) => matchesTerms(terms, c.displayName, c.nickname));
}
