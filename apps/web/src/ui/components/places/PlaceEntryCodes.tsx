import Box from '@mui/material/Box';
import { useGetPlaceEntry, useRemoveEntryCode, useSetEntryCode } from '@lupira/cal-api/query/contact';
import { EntryCodes } from '@danbro96/lupira-web-mui/EntryCodes';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { useInvalidateContacts } from '../../../state/useInvalidate';
import { errText } from '../../errText';

/** A place's door codes. Nothing renders when nobody you can see lives there now (the API answers 404); the server
 *  decides who may change them. */
export function PlaceEntryCodes({ placeId }: { placeId: string }) {
  const { data: entry } = useGetPlaceEntry(placeId, { query: { retry: false } });
  const invalidate = useInvalidateContacts();
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const set = useSetEntryCode({ mutation: { onSuccess: invalidate, onError } });
  const remove = useRemoveEntryCode({ mutation: { onSuccess: invalidate, onError } });

  if (!entry) return null;
  return (
    <Box sx={{ px: 1, my: 1, pb: 1 }}>
      <EntryCodes
        codes={entry.codes}
        editable
        onSave={({ id, ...data }) => set.mutate({ placeId, codeId: id ?? crypto.randomUUID(), data })}
        onRemove={(codeId) => remove.mutate({ placeId, codeId })}
      />
    </Box>
  );
}
