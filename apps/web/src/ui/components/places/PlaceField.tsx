import { useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { pinStart } from '@danbro96/lupira-domain-places/pin';
import { pinNameRequired, type PlaceContext } from '@lupira/cal-domain/placeContext';
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

/** An event's place: the tile once chosen, else predicted chips, "More…" for the full search and a map pin.
 *  Only a stored place is ever a value, so typed text can't be saved by mistake. */
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
  const [pinning, setPinning] = useState(false);
  const { predictions, nameOf, origin } = usePlacePredictions(context, !value);
  const pin = usePinPlace();
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
          onEdit={disabled ? undefined : () => setSearching(true)}
          onClear={disabled ? undefined : () => onChange(null)}
        />
      ) : (
        <WrapRow>
          <PredictionChips
            predictions={predictions}
            nameOf={nameOf}
            disabled={disabled}
            onPick={(p) => pick(selectPlace(p.placeId, p.label, 'prediction'))}
          />
          <Chip icon={<SearchIcon />} label="More…" disabled={disabled} onClick={() => setSearching(true)} />
          <Chip icon={<PinDropIcon />} label="Pick on map" disabled={disabled} onClick={() => setPinning(true)} />
        </WrapRow>
      )}
      {!value && legacyText && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>“{legacyText}” from calendar text</Typography>
      )}
      <PlaceSearchDialog
        open={searching}
        context={context}
        initialText={value ? '' : legacyText ?? ''}
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
