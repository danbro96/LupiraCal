import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useRecordMove, useSearchContacts } from '@lupira/cal-api/query/contact';
import { ContactAddressType, type ContactDto } from '@lupira/cal-api/models';
import { parseFuzzyInput } from '@lupira/cal-domain/fuzzyDate';
import { addressTypeLabel, withResidency, type ContactAddressRow } from '@lupira/cal-domain/residents';
import { useInvalidateContacts } from '../../../state/useInvalidate';
import { errText } from '../../errText';
import { PlacePicker } from '../places/PlacePicker';
import { useSnackbar } from '../SnackbarHost';

/** Tells a move once for everyone who moves: each one's current residencies at the place they leave end on the date,
 *  and a residency at the new place starts then. Starts from the contact's current home and the people living there. */
export function MoveDialog({ contact, rows, onClose }: { contact: ContactDto; rows: readonly ContactAddressRow[]; onClose: () => void }) {
  const { data: contacts } = useSearchContacts({});
  const current = rows.filter((r) => withResidency(r).status === 'active');
  const homes = current.filter((r) => r.contactId === contact.id && r.addressType === 'Home');
  const [fromPlaceId, setFromPlaceId] = useState<string>(homes[0]?.placeId ?? '');
  const livingThere = (placeId: string) => [...new Set(current.filter((r) => r.placeId === placeId).map((r) => r.contactId))];
  const [movers, setMovers] = useState<string[]>(fromPlaceId ? livingThere(fromPlaceId) : [contact.id]);
  const [toPlaceId, setToPlaceId] = useState<string | null>(null);
  const [type, setType] = useState<ContactAddressType>(ContactAddressType.Home);
  const [when, setWhen] = useState('');
  const invalidate = useInvalidateContacts();
  const showSnack = useSnackbar();
  const move = useRecordMove({ mutation: { onSuccess: () => { invalidate(); onClose(); }, onError: (e) => showSnack(errText(e) ?? 'Move failed.') } });

  const movedIn = when.trim() ? parseFuzzyInput(when) : null;
  const nameOf = (id: string) => contacts?.find((c) => c.id === id)?.displayName ?? id.slice(0, 8);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Move</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Autocomplete
          multiple
          options={(contacts ?? []).map((c) => c.id)}
          value={movers}
          onChange={(_, ids) => setMovers(ids)}
          getOptionLabel={nameOf}
          renderInput={(params) => <TextField {...params} label="Who moves" />}
        />
        <TextField
          select
          label="From"
          value={fromPlaceId}
          onChange={(e) => {
            setFromPlaceId(e.target.value);
            if (e.target.value) setMovers(livingThere(e.target.value));
          }}
        >
          <MenuItem value="">Nowhere (a new place)</MenuItem>
          {homes.map((h) => <MenuItem key={h.placeId} value={h.placeId}>{h.label || addressTypeLabel(h.addressType)}</MenuItem>)}
        </TextField>
        <PlacePicker placeId={toPlaceId} placeholder="Moving to — street, city…" onChange={setToPlaceId} />
        <TextField select label="As" value={type} onChange={(e) => setType(e.target.value as ContactAddressType)}>
          {Object.values(ContactAddressType).map((t) => <MenuItem key={t} value={t}>{addressTypeLabel(t)}</MenuItem>)}
        </TextField>
        <TextField
          label="Moving in"
          placeholder="YYYY, YYYY-MM or YYYY-MM-DD"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          error={!!when.trim() && !movedIn}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={movers.length === 0 || !toPlaceId || !movedIn || move.isPending}
          onClick={() => move.mutate({ data: { contactIds: movers, toPlaceId: toPlaceId!, type, movedIn: movedIn!, fromPlaceId: fromPlaceId || null } })}
        >
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
}
