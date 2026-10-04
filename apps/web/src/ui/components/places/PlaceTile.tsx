import { lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { placeSpanM } from '@danbro96/lupira-domain-maps/mapZoom';
import { placeTitle } from '@danbro96/lupira-domain-places/places';
import { GEO_API_BASE_URL } from '../../../config';
import { siblingLinks } from '../../../config/siblings';
import { useGeoPlace } from '../../../state/usePlaces';
import { useCopy } from '../../hooks/useCopy';
import { CopyIcon, EditIcon, PlaceIcon } from '@danbro96/lupira-web-mui/icons';

const MiniMap = lazy(() => import('@danbro96/lupira-web-maplibre/MiniMap'));

const THUMB_W = 72;
const THUMB_H = 56;

/** How the app shows a place, as on the phone: its name, the address and an optional meta line (address
 *  type, residency) — one line each, ellipsized — and a map thumbnail framed by the kind of place. The
 *  tile opens the place on the map; the copy button takes the address (the name when there is none). */
export function PlaceTile({ placeId, label, meta, muted, onEdit }: {
  placeId: string | null | undefined;
  /** Shown instead of the place's own name — an event's location label. */
  label?: string | null;
  meta?: string | null;
  /** A former or future address: present, but not where anyone is. */
  muted?: boolean;
  onEdit?: () => void;
}) {
  const { data: place } = useGeoPlace(placeId ?? undefined);
  const copy = useCopy();
  const title = placeTitle(label, place?.name, placeId);
  const address = place?.formattedAddress && place.formattedAddress !== title ? place.formattedAddress : null;
  const point = place?.latitude != null && place.longitude != null ? { lat: place.latitude, lon: place.longitude } : null;

  const body = (
    <>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 500 }}>{title}</Typography>
        {address && <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>{address}</Typography>}
        {meta && <Typography variant="caption" noWrap component="p" sx={{ color: 'text.secondary' }}>{meta}</Typography>}
      </Box>
      {point ? (
        <Suspense fallback={<Thumb />}>
          <MiniMap point={point} spanM={placeSpanM(place)} width={THUMB_W} height={THUMB_H} geoBase={GEO_API_BASE_URL} />
        </Suspense>
      ) : (
        <Thumb />
      )}
    </>
  );

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, opacity: muted ? 0.6 : 1 }}>
      {point ? (
        <Box
          component="a"
          href={siblingLinks.mapsAtUrl(point)}
          sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5, color: 'inherit', textDecoration: 'none', borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
        >
          {body}
        </Box>
      ) : (
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}>{body}</Box>
      )}
      {(placeId || label) && (
        <Tooltip title={address ? 'Copy address' : 'Copy name'}>
          <IconButton size="small" onClick={() => copy(place?.formattedAddress || title, place?.formattedAddress ? 'Address' : 'Place name')}>
            <CopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onEdit && (
        <Tooltip title="Change place">
          <IconButton size="small" onClick={onEdit}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

function Thumb() {
  return (
    <Box sx={{ width: THUMB_W, height: THUMB_H, flex: 'none', borderRadius: 1, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <PlaceIcon fontSize="small" sx={{ color: 'text.secondary' }} />
    </Box>
  );
}
