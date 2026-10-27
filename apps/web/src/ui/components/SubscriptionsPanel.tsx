import { useState } from 'react';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { ContainerDto, ItemColor, SubscriptionDto } from '@lupira/cal-api/models';
import { canManageSubscriptions, isRefreshPending, subscriptionStatus, type SubscriptionTone } from '@lupira/cal-domain/subscriptions';
import { plural } from '@danbro96/lupira-domain-core/wording';
import { itemColor } from '@lupira/cal-tokens/itemColors';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { useSubscriptionMutations, useSubscriptions } from '../../state/useSubscriptions';
import { calendarColor } from '../theme/kinds';
import { errText } from '../errText';
import { ColorSwatches } from './ColorSwatches';
import { NamedIcon } from './KindIcon';
import { WrapRow } from './WrapRow';

type Mutations = ReturnType<typeof useSubscriptionMutations>;

const TONE_COLORS: Record<SubscriptionTone, string> = {
  ok: 'success.main',
  pending: 'text.secondary',
  error: 'error.main',
};

/** A calendar's subscribed feeds: every member sees them and their sync status; owners add, rename, recolour,
 *  refresh and remove them. */
export function SubscriptionsPanel({ calendar }: { calendar: ContainerDto }) {
  const { subscriptions, isLoading } = useSubscriptions(calendar.id);
  const showSnack = useSnackbar();
  const mutations = useSubscriptionMutations((e) => showSnack(errText(e) ?? 'Request failed.'));
  const canManage = canManageSubscriptions(calendar);
  const [adding, setAdding] = useState(false);

  return (
    <Box sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
      {isLoading && <Typography variant="caption" sx={{ color: 'text.secondary' }}>Loading…</Typography>}
      {!isLoading && subscriptions.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>No subscribed calendars.</Typography>
      )}
      {subscriptions.map((s) => (
        <SubscriptionRow key={s.id} s={s} calendar={calendar} canManage={canManage} mutations={mutations} />
      ))}
      {canManage && (adding
        ? <NewSubscriptionForm calendar={calendar} mutations={mutations} onDone={() => setAdding(false)} />
        : (
          <Button variant="text" onClick={() => setAdding(true)}>
            + Subscribe to a calendar
          </Button>
        ))}
    </Box>
  );
}

function SubscriptionRow({ s, calendar, canManage, mutations }: { s: SubscriptionDto; calendar: ContainerDto; canManage: boolean; mutations: Mutations }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const now = new Date();
  const status = subscriptionStatus(s, now);
  const ids = { calendarId: s.calendarId, subscriptionId: s.id };

  if (editing) {
    return (
      <EditSubscriptionForm
        s={s}
        calendar={calendar}
        mutations={mutations}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <Box sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
      <WrapRow sx={{ my: 0 }}>
        <Box component="span" sx={{ width: 13, height: 13, borderRadius: '999px', border: 1, borderColor: 'border', flex: 'none', display: 'inline-block' }} style={{ background: itemColor(s.color, calendarColor(calendar)) }} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          <NamedIcon name="subscribed" sx={{ fontSize: 15, verticalAlign: -2, mr: 0.5 }} />
          {s.displayName}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.subtle' }}>{s.sourceHost}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{plural(s.eventCount, 'event')}</Typography>
        {canManage && (
          <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
            <Button variant="text" disabled={isRefreshPending(s, now) || mutations.refresh.isPending} onClick={() => mutations.refresh.mutate(ids)}>
              Refresh
            </Button>
            <Button variant="text" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="text" color="error" onClick={() => setConfirming(true)}>
              Remove
            </Button>
          </Box>
        )}
      </WrapRow>
      <Typography variant="caption" component="p" sx={{ color: TONE_COLORS[status.tone] }}>{status.text}</Typography>
      {confirming && (
        <WrapRow>
          <Typography variant="body2">Remove “{s.displayName}” and its events from this calendar?</Typography>
          <Button variant="contained" color="error" disabled={mutations.remove.isPending} onClick={() => mutations.remove.mutate(ids)}>
            Remove
          </Button>
          <Button variant="outlined" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </WrapRow>
      )}
    </Box>
  );
}

function EditSubscriptionForm({ s, calendar, mutations, onDone }: { s: SubscriptionDto; calendar: ContainerDto; mutations: Mutations; onDone: () => void }) {
  const [displayName, setDisplayName] = useState(s.displayName);
  const [color, setColor] = useState<ItemColor | null>(s.color ?? null);

  return (
    <Paper variant="outlined" component="form" sx={{ p: '12px 16px', my: 1 }}
      onSubmit={(e) => {
        e.preventDefault();
        mutations.update.mutate(
          { calendarId: s.calendarId, subscriptionId: s.id, data: { displayName: displayName.trim(), color } },
          { onSuccess: onDone },
        );
      }}
    >
      <WrapRow>
        <TextField placeholder="Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required slotProps={{ htmlInput: { maxLength: 100 } }} />
      </WrapRow>
      <ColorSwatches value={color} calendarFill={calendarColor(calendar)} onChange={setColor} />
      <WrapRow>
        <Button variant="contained" type="submit" disabled={mutations.update.isPending || !displayName.trim()}>
          Save
        </Button>
        <Button variant="outlined" type="button" onClick={onDone}>
          Cancel
        </Button>
      </WrapRow>
    </Paper>
  );
}

function NewSubscriptionForm({ calendar, mutations, onDone }: { calendar: ContainerDto; mutations: Mutations; onDone: () => void }) {
  const [form, setForm] = useState({ feedUrl: '', displayName: '', color: null as ItemColor | null });
  const ready = form.feedUrl.trim() && form.displayName.trim();

  return (
    <Paper variant="outlined" component="form" sx={{ p: '12px 16px', my: 1 }}
      onSubmit={(e) => {
        e.preventDefault();
        mutations.create.mutate(
          { calendarId: calendar.id, data: { feedUrl: form.feedUrl.trim(), displayName: form.displayName.trim(), color: form.color } },
          { onSuccess: onDone },
        );
      }}
    >
      <WrapRow>
        <TextField
          placeholder="Calendar address"
          value={form.feedUrl}
          onChange={(e) => setForm({ ...form, feedUrl: e.target.value })}
          required
          sx={{ flex: 1, minWidth: 260 }}
          slotProps={{ htmlInput: { inputMode: 'url', maxLength: 2048, autoComplete: 'off', spellCheck: false } }}
        />
        <TextField placeholder="Name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required slotProps={{ htmlInput: { maxLength: 100 } }} />
      </WrapRow>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
        Paste the calendar's published address. Google Calendar: Settings → your calendar → Secret address in iCal format.
        Outlook: Settings → Calendar → Shared calendars → Publish a calendar → ICS link.
      </Typography>
      <ColorSwatches value={form.color} calendarFill={calendarColor(calendar)} onChange={(color) => setForm({ ...form, color })} />
      <WrapRow>
        <Button variant="contained" type="submit" disabled={mutations.create.isPending || !ready}>
          Subscribe
        </Button>
        <Button variant="outlined" type="button" onClick={onDone}>
          Cancel
        </Button>
      </WrapRow>
    </Paper>
  );
}
