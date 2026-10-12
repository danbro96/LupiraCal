import type { PlaceContext } from '@lupira/cal-domain/placeContext';
import { predictPlaces } from '@lupira/cal-domain/placePrediction';
import { usePlaceSources } from './usePlaceSources';

/** The few places most likely meant for this context, each with why. */
export function usePlacePredictions(ctx: PlaceContext, enabled = true) {
  const known = usePlaceSources(ctx, enabled);
  return { ...known, predictions: predictPlaces(known.context, known.sources) };
}
