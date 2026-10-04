import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useGetPlaceEntry, useRemoveEntryCode, useSetEntryCode } from '@lupira/cal-api/query/contact';
import { useInvalidateContacts } from '../../../state/useInvalidate';
import { errText } from '../../errText';
import { useCopy } from '../../hooks/useCopy';
import { CloseIcon, CopyIcon, EntryCodeIcon } from '@danbro96/lupira-web-mui/icons';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { WrapRow } from '../WrapRow';

/** A place's door and gate codes, masked until clicked. Nothing renders when nobody you can see lives there now (the
 *  API answers 404). With `editable`, codes can be added and removed; the server decides who may. */
export function EntryCodes({ placeId, editable = false }: { placeId: string; editable?: boolean }) {
  const { data: entry } = useGetPlaceEntry(placeId, { query: { retry: false } });
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('Port');
  const [code, setCode] = useState('');
  const copy = useCopy();
  const invalidate = useInvalidateContacts();
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const set = useSetEntryCode({ mutation: { onSuccess: invalidate, onError } });
  const remove = useRemoveEntryCode({ mutation: { onSuccess: invalidate, onError } });

  if (!entry || (entry.codes.length === 0 && !editable)) return null;
  return (
    <WrapRow sx={{ px: 1, pb: 1 }}>
      {entry.codes.map((c) => (
        <Box key={c.id} sx={{ display: 'inline-flex', alignItems: 'center' }}>
          <Chip
            variant="outlined"
            icon={<EntryCodeIcon fontSize="small" />}
            label={`${c.label} ${shown.has(c.id) ? c.code : '••••'}${shown.has(c.id) && c.note ? ` · ${c.note}` : ''}`}
            onClick={() => setShown((s) => new Set(s).add(c.id))}
            onDelete={editable ? () => remove.mutate({ placeId, codeId: c.id }) : undefined}
            deleteIcon={editable ? <CloseIcon /> : undefined}
          />
          {shown.has(c.id) && (
            <Tooltip title={`Copy ${c.label}`}>
              <IconButton size="small" onClick={() => copy(c.code, c.label)}><CopyIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Box>
      ))}
      {editable && !adding && <Button variant="text" size="small" onClick={() => setAdding(true)}>Add door code</Button>}
      {editable && adding && (
        <WrapRow
          component="form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            if (!label.trim() || !code.trim()) return;
            set.mutate({ placeId, codeId: crypto.randomUUID(), data: { label: label.trim(), code: code.trim() } });
            setCode('');
            setAdding(false);
          }}
        >
          <TextField size="small" label="Opens" value={label} onChange={(e) => setLabel(e.target.value)} />
          <TextField size="small" label="Code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          <Button type="submit" variant="outlined" size="small" disabled={!code.trim() || set.isPending}>Save</Button>
        </WrapRow>
      )}
    </WrapRow>
  );
}
