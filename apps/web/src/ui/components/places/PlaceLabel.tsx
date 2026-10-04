import { useGeoPlace } from '../../../state/usePlaces';

/** Name of a LupiraGeoApi place for a stored placeId. */
export function PlaceLabel({ placeId }: { placeId?: string | null }) {
  const { data: place } = useGeoPlace(placeId ?? undefined);
  return <span title={place?.formattedAddress ?? undefined}>{place?.name ?? '…'}</span>;
}
