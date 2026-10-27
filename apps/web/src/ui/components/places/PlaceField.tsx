import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { pinStart } from '@danbro96/lupira-domain-places/pin';
import { pinNameRequired, type PlaceContext } from '@lupira/cal-domain/placeContext';
import { PLACE_SEARCH_PROMPT } from '@lupira/cal-domain/placeOmnibox';
import { PREDICTION_CHIPS } from '@lupira/cal-domain/placePrediction';
import { selectPlace, type PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { SearchIcon } from '@danbro96/lupira-web-mui/icons';
import { usePlacePredictions } from '../../../state/usePlacePredictions';
import { usePinPlace } from '../../../state/usePlaces';
import { errText } from '../../errText';
import { ICON_BY_NAME } from '../../theme/kinds';
import { WrapRow } from '../WrapRow';
import { PinPlaceDialog } from './PinPlaceDialog';
import { PlaceSearchDialog } from './PlaceSearchDialog';
import { PlaceTile } from './PlaceTile';
import { PredictionChips } from './PredictionChips';

const PinDropIcon = ICON_BY_NAME.pinDrop;

/** An event's place: the tile once chosen, else a search field (typing opens the full search, its map icon a pin)
 *  over the likeliest few places. Only a stored place is ever a value, so typed text can't be saved by mistake. */
export function PlaceField({ value, onChange, context, label, disabled, legacyText }: {
  value: PlaceSelection | null;
  onChange: (value: PlaceSelection | null) => void;
  context: PlaceContext;
  label?: string;
  disabled?: boolean;
  /** Free text an imported event came with; it seeds the search. */
  legacyText?: string | null;
}) {
  const [searching, setSearching] = useState(false);
  const [seed, setSeed] = useState('');
  const [pinning, setPinning] = useState(false);
  const { predictions, nameOf, origin } = usePlacePredictions(context, !value);
  const pin = usePinPlace();
  const search = (text: string) => {
    setSeed(text);
    setSearching(true);
  };
  const pick = (selection: PlaceSelection) => {
    setSearching(false);
    setPinning(false);
    onChange(selection);
  };

  return (
    <Box>
      {label && <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>{label}</Typography>}
      {value ? (
        <PlaceTile
          placeId={value.placeId}
          label={value.label || null}
          onEdit={disabled ? undefined : () => search('')}
          onClear={disabled ? undefined : () => onChange(null)}
        />
      ) : (
        <>
          <TextField
            fullWidth
            size="small"
            value=""
            placeholder={PLACE_SEARCH_PROMPT}
            disabled={disabled}
            onClick={() => search('')}
            onKeyDown={(e) => {
              if (e.key.length === 1 || e.key === 'Enter') {
                e.preventDefault();
                search(e.key.length === 1 ? e.key : '');
              }
            }}
            slotProps={{
              htmlInput: { readOnly: true, 'aria-haspopup': 'dialog' },
              input: {
                startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Pick on map">
                      <IconButton
                        edge="end"
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPinning(true);
                        }}
                      >
                        <PinDropIcon />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
          {predictions.length > 0 && (
            <WrapRow sx={{ mt: 1 }}>
              <PredictionChips
                predictions={predictions.slice(0, PREDICTION_CHIPS)}
                nameOf={nameOf}
                disabled={disabled}
                onPick={(p) => pick(selectPlace(p.placeId, p.label, 'prediction'))}
              />
            </WrapRow>
          )}
        </>
      )}
      {!value && legacyText && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>“{legacyText}” from calendar text</Typography>
      )}
      <PlaceSearchDialog
        open={searching}
        context={context}
        initialText={seed || (value ? '' : legacyText ?? '')}
        onClose={() => setSearching(false)}
        onPicked={pick}
      />
      {pinning && (
        <PinPlaceDialog
          start={pinStart({ origin })}
          nameRequired={pinNameRequired(context)}
          busy={pin.isPending}
          error={pin.error ? errText(pin.error) : null}
          onCancel={() => {
            pin.reset();
            setPinning(false);
          }}
          onConfirm={(point, name) => pin.mutate({ ...point, name }, { onSuccess: pick })}
        />
      )}
    </Box>
  );
}
