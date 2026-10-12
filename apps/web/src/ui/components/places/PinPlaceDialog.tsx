import { lazy, Suspense, useState } from 'react';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import { GEO_API_BASE_URL } from '../../../config';
import { usePinSuggestion } from '../../../state/usePinSuggestion';

const MapPinDialog = lazy(() => import('@danbro96/lupira-web-maplibre/MapPinDialog'));

/** Drop a pin and name it in one dialog — the name follows the address under the pin until you type one. */
export function PinPlaceDialog({ start, initialPin, nameRequired, busy, error, onCancel, onConfirm }: {
  start: GeoPoint & { zoom?: number };
  initialPin?: GeoPoint | null;
  nameRequired: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (point: GeoPoint, name: string | null) => void;
}) {
  const [point, setPoint] = useState<GeoPoint | null>(initialPin ?? null);
  const [typed, setTyped] = useState<string | null>(null);
  const { suggestion, loading } = usePinSuggestion(point);
  const name = typed ?? suggestion ?? '';

  return (
    <Suspense fallback={null}>
      <MapPinDialog
        open
        start={start}
        initialPin={initialPin}
        geoBase={GEO_API_BASE_URL}
        onCancel={() => {
          if (!busy) onCancel();
        }}
        onPinChange={setPoint}
        confirmDisabled={busy || (nameRequired && !name.trim())}
        onConfirm={(p) => onConfirm(p, name.trim() || null)}
      >
        <TextField
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
          sx={{ mt: 1, mb: 2 }}
        />
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {busy && <LinearProgress sx={{ mb: 2 }} />}
      </MapPinDialog>
    </Suspense>
  );
}
