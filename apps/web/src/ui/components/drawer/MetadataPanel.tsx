import { useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useMergeItemMetadata } from '@lupira/cal-api/query/cal';
import type { JsonObject } from '@lupira/cal-api/models';
import { useInvalidateItems } from '../../../state/useInvalidate';
import { DrawerSection } from '../DrawerSection';

/** The item's free-form JSON metadata, with a merge editor (POST /items/{id}/metadata merges keys). */
export function MetadataPanel({ itemId, metadata }: { itemId: string; metadata: JsonObject }) {
  const [open, setOpen] = useState(false);
  const [patch, setPatch] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const invalidate = useInvalidateItems();
  const merge = useMergeItemMetadata({
    mutation: {
      onSuccess: () => {
        invalidate();
        setPatch('');
      },
    },
  });

  const isEmpty = Object.keys(metadata).length === 0;

  return (
    <DrawerSection
      title={
        <Button
          variant="text"
          endIcon={open ? <ExpandMoreIcon /> : <ChevronRightIcon />}
          onClick={() => setOpen((o) => !o)}
        >
          Metadata
        </Button>
      }
    >
      {open && (
        <>
          <Box component="pre" sx={{ bgcolor: 'background.paper', borderRadius: 1, p: '8px 12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, overflowX: 'auto', maxHeight: 240 }}>{isEmpty ? '{}' : JSON.stringify(metadata, null, 2)}</Box>
          <TextField
            multiline
            minRows={3}
            slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
            placeholder='Merge JSON, e.g. {"source":"manual"}'
            value={patch}
            onChange={(e) => setPatch(e.target.value)}
          />
          {jsonError && <Typography variant="body2" component="p" sx={{ my: 0.5, color: 'error.main' }}>{jsonError}</Typography>}
          <Button
            variant="outlined"
            disabled={!patch || merge.isPending}
            onClick={() => {
              try {
                const data: unknown = JSON.parse(patch);
                if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                  setJsonError('Patch must be a JSON object.');
                  return;
                }
                setJsonError(null);
                merge.mutate({ id: itemId, data: data as JsonObject });
              } catch {
                setJsonError('Patch must be valid JSON.');
              }
            }}
          >
            Merge
          </Button>
        </>
      )}
    </DrawerSection>
  );
}
