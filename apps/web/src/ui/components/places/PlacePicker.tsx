import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import { forwardGeocode } from '@lupira/cal-api/query/geo';
import { SuggestionType, type PlaceSuggestionDto } from '@lupira/cal-api/models';
import { ADDRESS_SEARCH_LIMIT, PLACE_SEARCH_DEBOUNCE_MS } from '@danbro96/lupira-domain-places/placeCandidates';
import { EMPHASIS } from '@lupira/cal-tokens/color';
import { usePlaceCandidates } from '../../../state/usePlaceCandidates';
import { useCreatePlaceAtPin, useCreatePlaceFromHit } from '../../../state/usePlaces';
import { errText } from '../../errText';
import { GeocodePreview } from './GeocodePreview';
import {
  initialPickerState,
  transition,
  type PickerCommand,
  type PickerEvent,
  type PickerState,
} from './placePickerMachine';
import { PlaceLabel } from './PlaceLabel';
import { PlaceIcon } from '@danbro96/lupira-web-mui/icons';

const MapPinDialog = lazy(() => import('../map/MapPinDialog'));

type PickerOption = PlaceSuggestionDto & { residentsLine?: string | null; otherLine?: string | null; faded?: boolean };

/** Turn user input into a LupiraGeoApi placeId: one ranked list of existing places (saved, frequent,
 *  typeahead, and contacts' addresses — search a name to find where they live; an invited person's home
 *  leads), each saying who lives there; committing unmatched free text runs the picker machine — forward
 *  geocode → hit preview → pick, or drop a pin on the map. Nothing is ever created on cancel/dismiss. */
export function PlacePicker({ placeId, onChange, placeholder, initialText, autoFocus, attendeeIds = [], day = null }: {
  placeId: string | null;
  onChange: (placeId: string | null) => void;
  placeholder?: string;
  initialText?: string;
  autoFocus?: boolean;
  /** Invited people — their homes lead the list. */
  attendeeIds?: readonly string[];
  /** The event's day, 'yyyy-MM-dd' — its other events break ties by distance. */
  day?: string | null;
}) {
  const [state, setState] = useState<PickerState>(() => initialPickerState(initialText ?? ''));
  const stateRef = useRef(state);
  const createFromHit = useCreatePlaceFromHit();
  const createAtPin = useCreatePlaceAtPin();

  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(state.text.trim()), PLACE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state.text]);
  const [opened, setOpened] = useState(false);
  const { places, localities, typing, loading } = usePlaceCandidates({ query: q, opened, attendeeIds, day });
  const options: PickerOption[] = [
    ...places.map((p) => ({
      id: p.placeId,
      type: SuggestionType.Place,
      name: p.label,
      context: p.context,
      latitude: p.point?.lat,
      longitude: p.point?.lon,
      residentsLine: p.residentsLine,
      otherLine: p.otherLine,
      faded: !!p.viaContact && p.viaContact.status !== 'active',
    })),
    ...localities,
  ];

  const dispatch = (event: PickerEvent) => {
    const { state: next, commands } = transition(stateRef.current, event);
    stateRef.current = next;
    setState(next);
    for (const cmd of commands) run(cmd);
  };

  const run = (cmd: PickerCommand) => {
    switch (cmd.kind) {
      case 'geocode':
        forwardGeocode({ q: cmd.q, limit: ADDRESS_SEARCH_LIMIT })
          .then((hits) => dispatch({ type: 'GEOCODE_OK', token: cmd.token, hits }))
          .catch((e: unknown) => dispatch({ type: 'GEOCODE_ERROR', token: cmd.token, message: errText(e) ?? undefined }));
        return;
      case 'createFromHit':
        createFromHit.mutate(
          { hit: cmd.hit, typedName: cmd.typedName },
          {
            onSuccess: (place) => dispatch({ type: 'CREATE_OK', token: cmd.token, placeId: place.id }),
            onError: (e) => dispatch({ type: 'CREATE_ERROR', token: cmd.token, message: errText(e) ?? undefined }),
          },
        );
        return;
      case 'createAtPin':
        createAtPin.mutate(
          { name: cmd.name, lat: cmd.lat, lon: cmd.lon },
          {
            onSuccess: (place) => dispatch({ type: 'CREATE_OK', token: cmd.token, placeId: place.id }),
            onError: (e) => dispatch({ type: 'CREATE_ERROR', token: cmd.token, message: errText(e) ?? undefined }),
          },
        );
        return;
      case 'resolved':
        onChange(cmd.placeId);
        return;
    }
  };

  if (placeId) {
    return (
      <Box component="span" sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 1, flex: 1, flexWrap: 'wrap', width: '100%' }}>
        <PlaceIcon fontSize="small" sx={{ verticalAlign: -5, mr: 0.5 }} /> <PlaceLabel placeId={placeId} />
        <Tooltip title="Clear place">
          <IconButton onClick={() => onChange(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }

  const phase = state.phase;

  return (
    <Box component="span" sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 1, flex: 1, flexWrap: 'wrap', width: '100%' }}>
      <Autocomplete<PickerOption, false, false, true>
        freeSolo
        options={options}
        filterOptions={(x) => x}
        loading={loading || phase.kind === 'geocoding'}
        openOnFocus
        onOpen={() => setOpened(true)}
        groupBy={typing ? undefined : () => 'Suggested'}
        getOptionDisabled={(o) => o.type === SuggestionType.Locality}
        value={null}
        inputValue={state.text}
        // A freeSolo Enter commit isn't defaultPrevented by MUI and would submit a wrapping form
        // (ContactEditForm), unmounting the picker before the geocode preview can render.
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
        }}
        onInputChange={(_, v) => dispatch({ type: 'TYPE', text: v })}
        onChange={(_, value) => {
          if (typeof value === 'string') {
            dispatch({ type: 'COMMIT', suggestions: options });
          } else if (value && value.type === SuggestionType.Place) {
            // Sync the machine text first so COMMIT's exact-name match short-circuits to resolved.
            dispatch({ type: 'TYPE', text: value.name });
            dispatch({ type: 'COMMIT', suggestions: [value] });
          }
        }}
        getOptionLabel={(o) => (typeof o === 'string' ? o : o.name)}
        renderOption={({ key, ...props }, o) => (
          <li key={key} {...props} style={o.faded ? { opacity: EMPHASIS.faded } : undefined}>
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span>
                {o.name}
                {o.type === SuggestionType.Locality && <Chip label="Area" sx={{ ml: 1 }} />}
                {o.context && <Typography variant="caption" sx={{ color: 'text.secondary' }}> {o.context}</Typography>}
              </span>
              {o.residentsLine ? (
                <Typography variant="caption" sx={{ color: 'primary.main' }}>{o.residentsLine}</Typography>
              ) : o.otherLine ? (
                <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{o.otherLine}</Typography>
              ) : null}
            </Box>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus={autoFocus}
            placeholder={placeholder ?? 'Search or type an address…'}
          />
        )}
        sx={{ flex: 1 }}
      />
      {state.error && phase.kind !== 'previewing' && phase.kind !== 'creating' && (
        <Typography variant="body2" component="span" sx={{ my: 0.5, color: 'error.main' }}>{state.error}</Typography>
      )}
      {(phase.kind === 'previewing' || phase.kind === 'creating') && (
        <GeocodePreview
          query={state.text}
          hits={phase.hits}
          busy={phase.kind === 'creating'}
          error={state.error}
          onPick={(index) => dispatch({ type: 'PICK_HIT', index })}
          onPin={() => dispatch({ type: 'OPEN_PIN', suggestions: options, hits: phase.hits })}
          onCancel={() => dispatch({ type: 'DISMISS' })}
        />
      )}
      {phase.kind === 'pinning' && (
        <Suspense fallback={null}>
          <MapPinDialog
            title={`Pin “${state.text.trim()}”`}
            center={phase.center}
            zoom={phase.zoom}
            onConfirm={(lat, lon) => dispatch({ type: 'PIN_CONFIRM', lat, lon })}
            onCancel={() => dispatch({ type: 'PIN_CANCEL' })}
          />
        </Suspense>
      )}
    </Box>
  );
}
