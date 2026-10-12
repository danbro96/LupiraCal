import { lazy, Suspense, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import { placeSpanM, TARGET_ZOOM } from '@danbro96/lupira-domain-maps/mapZoom';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import { GEO_API_BASE_URL } from '../../../config';
import { usePinSuggestion } from '../../../state/usePinSuggestion';

const MapPinDialog = lazy(() => import('@danbro96/lupira-web-maplibre/MapPinDialog'));
const MiniMap = lazy(() => import('@danbro96/lupira-web-maplibre/MiniMap'));

const PREVIEW_W = 396;
const PREVIEW_H = 160;

/** Drop a pin, then name it — the name starts as the address the pin landed on. MapPinDialog reports only the
 *  confirmed point, so naming is its own step. */
export function PinPlaceDialog({ start, nameRequired, busy, error, onCancel, onConfirm }: {
  start: GeoPoint & { zoom?: number };
  nameRequired: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (point: GeoPoint, name: string | null) => void;
}) {
  const [view, setView] = useState(start);
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const { suggestion, loading } = usePinSuggestion(point);
  const name = typed ?? suggestion ?? '';

  if (!point) {
    return (
      <Suspense fallback={null}>
        <MapPinDialog
          open
          start={view}
          geoBase={GEO_API_BASE_URL}
          title="Drop a pin"
          onCancel={onCancel}
          onConfirm={(p) => {
            setPoint(p);
            setTyped(null);
          }}
        />
      </Suspense>
    );
  }

  return (
    <Dialog open onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Name this place</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ height: PREVIEW_H, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover' }}>
          <Suspense fallback={null}>
            <MiniMap point={point} spanM={placeSpanM({ kind: 'Address' })} width={PREVIEW_W} height={PREVIEW_H} geoBase={GEO_API_BASE_URL} />
          </Suspense>
        </Box>
        <TextField
          autoFocus
          fullWidth
          label="Name"
          required={nameRequired}
          value={name}
          placeholder={loading ? 'Looking up the address…' : undefined}
          helperText={nameRequired ? undefined : 'Leave blank to name it after its address.'}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      {busy && <LinearProgress />}
      <DialogActions>
        <Button
          disabled={busy}
          onClick={() => {
            setView({ ...point, zoom: TARGET_ZOOM });
            setPoint(null);
          }}
        >
          Move pin
        </Button>
        <Button disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={busy || (nameRequired && !name.trim())} onClick={() => onConfirm(point, name.trim() || null)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
