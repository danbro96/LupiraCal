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

// React Compiler can't compile value blocks inside try/catch, so parsing stays out of the component.
function parsePatch(text: string): JsonObject | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return 'Patch must be valid JSON.';
  }
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as JsonObject) : 'Patch must be a JSON object.';
}

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
              const parsed = parsePatch(patch);
              if (typeof parsed === 'string') {
                setJsonError(parsed);
                return;
              }
              setJsonError(null);
              merge.mutate({ id: itemId, data: parsed });
            }}
          >
            Merge
          </Button>
        </>
      )}
    </DrawerSection>
  );
}
