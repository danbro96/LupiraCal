import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { predictionReasonText, type PlacePrediction, type PredictionReason } from '@lupira/cal-domain/placePrediction';
import { HomeIcon, PlaceIcon } from '@danbro96/lupira-web-mui/icons';

const HOME_REASONS = new Set<PredictionReason['kind']>(['attendeeHome', 'householdHome', 'ownHome']);

export function reasonsText(reasons: readonly PredictionReason[] | undefined, nameOf: (contactId: string) => string): string {
  return (reasons ?? []).map((r) => predictionReasonText(r, nameOf)).join(' · ');
}

export function isHomePrediction(reasons: readonly PredictionReason[] | undefined): boolean {
  return (reasons ?? []).some((r) => HOME_REASONS.has(r.kind));
}

/** Predicted places as one-tap chips; why each is offered shows on hover. */
export function PredictionChips({ predictions, nameOf, onPick, disabled }: {
  predictions: readonly PlacePrediction[];
  nameOf: (contactId: string) => string;
  onPick: (prediction: PlacePrediction) => void;
  disabled?: boolean;
}) {
  return predictions.map((p) => (
    <Tooltip key={p.placeId} title={reasonsText(p.reasons, nameOf)} describeChild>
      <Chip
        variant="outlined"
        icon={isHomePrediction(p.reasons) ? <HomeIcon /> : <PlaceIcon />}
        label={p.label}
        disabled={disabled}
        onClick={() => onPick(p)}
      />
    </Tooltip>
  ));
}
