import { useState } from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { NavLink, useLocation, useMatch, useSearchParams } from 'react-router-dom';
import { useCreateContact, useSetContactTags } from '@lupira/cal-api/query/contact';
import type { ContactDto, ContactReachChannel } from '@lupira/cal-api/models';
import { ReachMedium } from '@lupira/cal-api/models';
import { initialsOf } from '@danbro96/lupira-domain-contacts/contactNames';
import { PINNED_TAG, isPinned } from '@lupira/cal-domain/contactTiers';
import { avatarColor } from '@danbro96/lupira-tokens-calendar/kinds';
import { addressBookLabel, useAddressBooks } from '../../../state/useAddressBooks';
import { useInvalidateContacts } from '../../../state/useInvalidate';
import { useTieredContacts } from '../../../state/useTieredContacts';
import { errText } from '../../errText';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { birthdayFromFields, partialDateBadge } from '@lupira/cal-domain/partialDate';
import { contactNameError } from '@danbro96/lupira-domain-contacts/contactNames';
import { parseList } from '@lupira/cal-domain/itemForm';
import { useGroup } from './useGroup';
import { WrapRow } from '../WrapRow';
import { SidePane } from './panes';
import { CakeIcon, StarIcon } from '@danbro96/lupira-web-mui/icons';

/** Split a comma-separated input into reach channels of one medium (create-form convenience). */
function toChannels(raw: string, medium: ReachMedium): ContactReachChannel[] {
  return parseList(raw).map((value) => ({ medium, value, type: null, preferred: false }));
}

/** Middle pane: search + the contact rows, filtered by the selected book (?book) and, when a
 *  group is open, narrowed to that group's members (client-side — the API has no group filter). */
export function ContactList() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const bookId = params.get('book') ?? '';
  const query = params.get('q') ?? '';
  const groupId = useMatch('/contacts/groups/:groupId')?.params.groupId;
  const group = useGroup(bookId || undefined, groupId);

  const { addressBooks } = useAddressBooks();
  const { active, dormant, contacts, isLoading } = useTieredContacts({
    query: query || undefined,
    addressBookId: bookId || undefined,
  });
  const [creating, setCreating] = useState(false);
  const [showDormant, setShowDormant] = useState(false);

  // A text query or an open group already narrows the set — show one flat, untiered list then.
  const bypassTiers = !!query || !!groupId;
  const flatRows = groupId ? contacts.filter((c) => group?.members.some((m) => m.contactId === c.id)) : contacts;

  const setQuery = (q: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );

  return (
    <SidePane width={340}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 1.5,
          position: 'sticky',
          top: 0,
          bgcolor: 'background.default',
          zIndex: 1,
        }}
      >
        <TextField placeholder="Search names…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button variant="contained" onClick={() => setCreating((c) => !c)}>
          + New
        </Button>
      </Box>
      {creating && <NewContactForm defaultBookId={bookId || addressBooks[0]?.id} onDone={() => setCreating(false)} />}
      <Box sx={{ mb: 1.5 }}>
        {bypassTiers ? (
          <>
            {flatRows.map((c) => (
              <ContactRow key={c.id} contact={c} search={location.search} />
            ))}
            {flatRows.length === 0 && <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>No contacts.</Typography>}
          </>
        ) : (
          <>
            {active.map((c) => (
              <ContactRow key={c.id} contact={c} search={location.search} />
            ))}
            {active.length === 0 && dormant.length === 0 && !isLoading && <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>No contacts.</Typography>}
            {dormant.length > 0 && (
              <div>
                <ButtonBase
                  onClick={() => setShowDormant((s) => !s)}
                  sx={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    borderTop: 1,
                    borderColor: 'divider',
                    mt: 1.5,
                    py: 1,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'text.subtle',
                  }}
                >
                  {showDormant ? '▾' : '▸'} Dormant ({dormant.length})
                </ButtonBase>
                {showDormant && dormant.map((c) => <ContactRow key={c.id} contact={c} search={location.search} />)}
              </div>
            )}
          </>
        )}
      </Box>
    </SidePane>
  );
}

/** One contact row + a pin toggle (a reserved tag that keeps the contact in the Active tier). */
function ContactRow({ contact: c, search }: { contact: ContactDto; search: string }) {
  const invalidate = useInvalidateContacts();
  const showSnack = useSnackbar();
  const setTags = useSetContactTags({
    mutation: { onSuccess: invalidate, onError: (e) => showSnack(errText(e) ?? 'Request failed.') },
  });
  const pinned = isPinned(c);

  const togglePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const tags = pinned ? (c.tags ?? []).filter((t) => t !== PINNED_TAG) : [...(c.tags ?? []), PINNED_TAG];
    setTags.mutate({ id: c.id, data: { tags } });
  };

  return (
    <Box
      component={NavLink}
      to={{ pathname: `/contacts/${c.id}`, search }}
      className="contact-row"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: '10px',
        borderBottom: 1,
        borderColor: 'divider',
        textDecoration: 'none',
        color: 'text.primary',
        overflow: 'hidden',
        '&:hover, &.active': { bgcolor: 'background.paper' },
      }}
    >
      <ButtonBase
        onClick={togglePin}
        title={pinned ? 'Unpin' : 'Pin to keep in Active'}
        aria-label={pinned ? 'Unpin contact' : 'Pin contact'}
        sx={{
          flex: 'none',
          p: 0,
          fontSize: 14,
          lineHeight: 1,
          transition: 'opacity 0.12s, color 0.12s',
          // Revealed by the row it sits in — the .contact-row hook exists only for this.
          color: pinned ? 'primary.main' : 'text.subtle',
          opacity: pinned ? 1 : 0.2,
          '.contact-row:hover &': { opacity: pinned ? 1 : 0.7 },
          '@media (hover: none)': { opacity: pinned ? 1 : 0.7 },
        }}
      >
        <StarIcon fontSize="small" />
      </ButtonBase>
      <Avatar sx={{ width: 30, height: 30, fontSize: 12, fontWeight: 700, color: 'common.white' }} style={{ background: avatarColor(c.id) }}>
        {initialsOf(c.displayName)}
      </Avatar>
      <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.displayName}
        {c.nickname && c.nickname !== c.displayName ? <Typography variant="caption" sx={{ color: 'text.secondary' }}> “{c.nickname}”</Typography> : null}
      </Box>
      {c.birthday && <Chip variant="outlined" icon={<CakeIcon />} label={partialDateBadge(c.birthday)} />}
    </Box>
  );
}

function NewContactForm({ defaultBookId, onDone }: { defaultBookId?: string; onDone: () => void }) {
  const invalidate = useInvalidateContacts();
  const showSnack = useSnackbar();
  const create = useCreateContact({
    mutation: { onSuccess: () => { invalidate(); onDone(); }, onError: (e) => showSnack(errText(e) ?? 'Request failed.') },
  });
  const { addressBooks } = useAddressBooks();
  const [form, setForm] = useState({
    addressBookId: defaultBookId ?? '',
    givenName: '',
    familyName: '',
    nickname: '',
    emails: '',
    phones: '',
    birthday: '',
    birthdayYearKnown: true,
    birthdayMonth: '',
    birthdayDay: '',
  });

  return (
    <Paper variant="outlined" component="form" sx={{ p: '12px 16px', my: 1.5 }}
      onSubmit={(e) => {
        e.preventDefault();
        const nameError = contactNameError(form);
        if (nameError) {
          showSnack(nameError);
          return;
        }
        const channels = [...toChannels(form.emails, ReachMedium.Email), ...toChannels(form.phones, ReachMedium.Phone)];
        create.mutate({
          data: {
            addressBookId: form.addressBookId,
            givenName: form.givenName || null,
            familyName: form.familyName || null,
            nickname: form.nickname || null,
            channels: channels.length ? channels : null,
            birthday: birthdayFromFields({
              yearKnown: form.birthdayYearKnown, date: form.birthday, month: form.birthdayMonth, day: form.birthdayDay,
            }),
          },
        });
      }}
    >
      <WrapRow>
        <TextField select value={form.addressBookId} onChange={(e) => setForm({ ...form, addressBookId: e.target.value })} required slotProps={{ select: { displayEmpty: true } }}>
          <MenuItem value="">Address book…</MenuItem>
          {addressBooks.map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {addressBookLabel(b)}
            </MenuItem>
          ))}
        </TextField>
      </WrapRow>
      <WrapRow>
        <TextField placeholder="Given name" value={form.givenName} onChange={(e) => setForm({ ...form, givenName: e.target.value })} />
        <TextField placeholder="Family name" value={form.familyName} onChange={(e) => setForm({ ...form, familyName: e.target.value })} />
      </WrapRow>
      <WrapRow>
        <TextField placeholder="Nickname" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }} component="label">
          <input
            type="checkbox"
            checked={form.birthdayYearKnown}
            onChange={(e) => setForm({ ...form, birthdayYearKnown: e.target.checked, birthday: '', birthdayMonth: '', birthdayDay: '' })}
          />{' '}
          Enter year
        </Typography>
        {form.birthdayYearKnown ? (
          <Tooltip title="Birthday">
            <TextField type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
          </Tooltip>
        ) : (
          <>
            <TextField type="number" slotProps={{ htmlInput: { min: 1, max: 12 } }} placeholder="Birth month" value={form.birthdayMonth} onChange={(e) => setForm({ ...form, birthdayMonth: e.target.value })} />
            <TextField type="number" slotProps={{ htmlInput: { min: 1, max: 31 } }} placeholder="Birth day" value={form.birthdayDay} onChange={(e) => setForm({ ...form, birthdayDay: e.target.value })} />
          </>
        )}
      </WrapRow>
      <WrapRow>
        <TextField placeholder="Emails (comma-separated)" value={form.emails} onChange={(e) => setForm({ ...form, emails: e.target.value })} />
        <TextField placeholder="Phones (comma-separated)" value={form.phones} onChange={(e) => setForm({ ...form, phones: e.target.value })} />
      </WrapRow>
      <WrapRow>
        <Button variant="contained" type="submit" disabled={create.isPending}>
          Create
        </Button>
        <Button variant="outlined" onClick={onDone}>
          Cancel
        </Button>
      </WrapRow>
    </Paper>
  );
}
