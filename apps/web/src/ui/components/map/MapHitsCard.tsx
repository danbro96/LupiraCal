import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { MapHit } from '@lupira/cal-domain/mapHits';
import { describeHit, hitActions, type HitAction } from '@lupira/cal-domain/mapHitLabels';
import { MAP_COLORS, type MapTheme } from '@lupira/cal-tokens/map';
import { useInvalidatePlaces } from '../../../state/useInvalidate';
import { useCreatePlaceAtPin } from '../../../state/usePlaces';
import { errText } from '../../errText';
import { useSnackbar } from '../SnackbarHost';
import { WrapRow } from '../WrapRow';
import { EntryCodes } from '../places/EntryCodes';

/** What a click on the map found, as on the phone: one thing gets a card with its ways into a full screen;
 *  several — a contact's home with events and photos on it — get a list, a row opening its screen (or its
 *  card, for kinds without one). */
export function MapHitsCard({ hits, theme, onAction, onOpenPlace }: {
  hits: MapHit[];
  theme: MapTheme;
  onAction: (hit: MapHit, action: HitAction) => void;
  onOpenPlace: (placeId: string) => void;
}) {
  const [focused, setFocused] = useState<MapHit | null>(null);
  const single = hits.length === 1 ? hits[0] : focused;
  // Someone lives here now: the way in is what you came for.
  const home = hits.find((h) => h.kind === 'contact' && h.residency === 'active');
  const codes = home?.kind === 'contact' && home.placeId ? <EntryCodes placeId={home.placeId} /> : null;
  if (single) return <>{codes}<HitDetail hit={single} onAction={onAction} onOpenPlace={onOpenPlace} /></>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', pr: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{hits.length} things here</Typography>
      {codes}
      {hits.map((hit) => {
        const { title, detail } = describeHit(hit);
        const primary = hitActions(hit, { placeScreen: true })[0]?.action;
        return (
          <ButtonBase
            key={hit.key}
            onClick={() => (primary ? onAction(hit, primary) : setFocused(hit))}
            sx={{ justifyContent: 'flex-start', gap: 1, py: 0.5, px: 0.5, borderRadius: 1, textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', flex: 'none' }} style={{ background: dotColor(hit, theme) }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>{title}</Typography>
              {detail[0] && <Typography variant="caption" noWrap component="p" sx={{ color: 'text.secondary' }}>{detail[0]}</Typography>}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function HitDetail({ hit, onAction, onOpenPlace }: {
  hit: MapHit;
  onAction: (hit: MapHit, action: HitAction) => void;
  onOpenPlace: (placeId: string) => void;
}) {
  const { title, detail } = describeHit(hit);
  const actions = hitActions(hit, { placeScreen: true });
  return (
    <>
      {hit.kind === 'photo' && hit.thumbUrl && (
        <Box
          component="img"
          src={hit.thumbUrl}
          alt=""
          loading="lazy"
          sx={{ display: 'block', width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: '6px', mb: 1 }}
        />
      )}
      <Typography variant="subtitle2" sx={{ pr: 3 }}>
        {hit.kind === 'saved' && hit.icon ? `${hit.icon} ` : ''}{title}
      </Typography>
      {detail.map((line) => (
        <Typography key={line} variant="caption" component="p" sx={{ color: 'text.secondary' }}>{line}</Typography>
      ))}
      {(actions.length > 0 || (hit.kind === 'hotspot' && !hit.placeId)) && (
        <WrapRow>
          {actions.map(({ action, label }) => (
            <Button key={action} size="small" onClick={() => onAction(hit, action)}>{label}</Button>
          ))}
          {hit.kind === 'hotspot' && !hit.placeId && <SaveHotspot hit={hit} onSaved={onOpenPlace} />}
        </WrapRow>
      )}
    </>
  );
}

/** An unanchored hotspot can be promoted to a gazetteer place. */
function SaveHotspot({ hit, onSaved }: { hit: Extract<MapHit, { kind: 'hotspot' }>; onSaved: (placeId: string) => void }) {
  const create = useCreatePlaceAtPin();
  const invalidatePlaces = useInvalidatePlaces();
  const showSnack = useSnackbar();
  const save = () => create.mutate({ name: hit.label ?? 'Unnamed spot', lat: hit.point.lat, lon: hit.point.lon }, {
    onSuccess: (place) => {
      invalidatePlaces();
      onSaved(place.id);
    },
    onError: (e) => showSnack(errText(e) ?? 'Request failed.'),
  });
  return <Button size="small" onClick={save} disabled={create.isPending}>Save as place</Button>;
}

function dotColor(hit: MapHit, theme: MapTheme): string {
  const colors = MAP_COLORS[theme];
  switch (hit.kind) {
    case 'event': return hit.color ?? colors.eventFallback;
    case 'contact': return colors.contact;
    case 'photo':
    case 'photoCell': return colors.photo;
    case 'saved': return colors.saved;
    case 'hotspot': return colors.hotspot;
    case 'visit': return colors.visitFill;
    case 'currentFix': return colors.currentFill;
  }
}
