import { useEffect, useEffectEvent, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { GeocodeResultDto } from '@lupira/cal-api/models';
import { TARGET_ZOOM } from '@danbro96/lupira-domain-maps/mapZoom';
import { pinStart } from '@danbro96/lupira-domain-places/pin';
import {
  EMPTY_ADDRESS_DRAFT,
  addressPlaceName,
  addressQuery,
  draftFromComponents,
  normalizePostcode,
  residencyRowState,
  type AddressDraft,
  type ResidencyRowState,
} from '@lupira/cal-domain/addressDraft';
import { pinNameRequired, type PlaceContext } from '@lupira/cal-domain/placeContext';
import { selectPlace, type PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { HomeIcon, SearchIcon } from '@danbro96/lupira-web-mui/icons';
import { useAddressLookup } from '../../../state/useAddressLookup';
import { useHomeCountry } from '../../../state/useHomeCountry';
import { usePlacePredictions } from '../../../state/usePlacePredictions';
import { useGeoPlace, usePinPlace, useResolveGeocodeHit } from '../../../state/usePlaces';
import { errText } from '../../errText';
import { ICON_BY_NAME } from '../../theme/kinds';
import { WrapRow } from '../WrapRow';
import { PinPlaceDialog } from './PinPlaceDialog';
import { PlaceSearchDialog } from './PlaceSearchDialog';
import { PlaceTile } from './PlaceTile';

const PinDropIcon = ICON_BY_NAME.pinDrop;
const COUNTRIES = ['SE', 'NO', 'DK', 'FI', 'IS', 'EE', 'LV', 'LT', 'DE', 'PL', 'NL', 'GB', 'FR', 'ES', 'IT'];
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** Where someone lives, typed as an address: street with suggestions, postcode, city, country; or a household
 *  member's home, an existing place, or a pin. Reports whether a half-typed address is pending, so Save can wait. */
export function AddressForm({ value, onResolved, context, onStateChange }: {
  value: PlaceSelection | null;
  onResolved: (selection: PlaceSelection | null) => void;
  context: PlaceContext;
  onStateChange?: (state: ResidencyRowState) => void;
}) {
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_ADDRESS_DRAFT);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<'search' | 'pin' | 'adjust' | null>(null);
  const open = !value || editing;
  const { predictions, nameOf, origin, sources } = usePlacePredictions(context, open);
  const homeCountry = useHomeCountry(open ? sources.ownHomePlaceId : null);
  const country = draft.countryCode || homeCountry;
  const typed = { ...draft, countryCode: country };
  const lookup = useAddressLookup(typed, origin, open);
  const resolve = useResolveGeocodeHit();
  const pin = usePinPlace();
  const { data: current } = useGeoPlace(value?.placeId);
  const currentPoint = current?.latitude != null && current.longitude != null ? { lat: current.latitude, lon: current.longitude } : null;

  const rowState: ResidencyRowState = open && residencyRowState({ draft }) === 'drafting' ? 'drafting' : value ? 'resolved' : 'empty';
  const report = useEffectEvent((state: ResidencyRowState) => onStateChange?.(state));
  useEffect(() => report(rowState), [rowState]);

  const done = (selection: PlaceSelection, nextDraft: AddressDraft = EMPTY_ADDRESS_DRAFT) => {
    setDraft(nextDraft);
    setEditing(false);
    setDialog(null);
    onResolved(selection);
  };
  const pickHit = (hit: GeocodeResultDto) =>
    resolve.mutate({ hit, name: addressPlaceName(hit) }, { onSuccess: (s) => done(s, draftFromComponents(hit)) });
  const edit = (field: keyof AddressDraft) => (e: { target: { value: string } }) => {
    resolve.reset();
    setDraft((d) => ({ ...d, [field]: e.target.value }));
  };
  const sameAs = predictions.flatMap((p) => {
    const ids = [...new Set(p.reasons.flatMap((r) => (r.kind === 'householdHome' ? [r.contactId] : [])))];
    return ids.length > 0 ? [{ ...p, who: ids.map(nameOf).join(' & ') }] : [];
  });
  const noMatch = !!addressQuery(typed) && !lookup.searching && !lookup.failed && lookup.hits.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 240 }}>
      {!open && value ? (
        <>
          <PlaceTile
            placeId={value.placeId}
            label={value.label || null}
            onEdit={() => setEditing(true)}
            onClear={() => {
              setDraft(EMPTY_ADDRESS_DRAFT);
              onResolved(null);
            }}
          />
          <WrapRow sx={{ my: 0 }}>
            <Button size="small" startIcon={<PinDropIcon />} disabled={!currentPoint} onClick={() => setDialog('adjust')}>
              Adjust pin
            </Button>
          </WrapRow>
        </>
      ) : (
        <>
          <TextField
            label="Street and number"
            value={draft.street}
            autoComplete="off"
            onChange={edit('street')}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (lookup.hits[0]) pickHit(lookup.hits[0]);
            }}
          />
          {lookup.hits.length > 0 && (
            <List dense disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
              {lookup.hits.map((hit, i) => (
                <ListItemButton key={`${hit.osmType ?? ''}${hit.osmId ?? i}`} disabled={resolve.isPending} onClick={() => pickHit(hit)}>
                  <ListItemText
                    primary={addressPlaceName(hit) ?? hit.displayName}
                    secondary={[hit.postcode, hit.locality].filter(Boolean).join(' ') || null}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
          {(lookup.searching || resolve.isPending) && <LinearProgress />}
          {noMatch && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>No address found — check it, or pick it on the map.</Typography>
          )}
          {resolve.error && <Typography variant="caption" sx={{ color: 'error.main' }}>{errText(resolve.error)}</Typography>}
          <WrapRow sx={{ my: 0 }}>
            <TextField
              label="Postcode"
              value={draft.postcode}
              onChange={edit('postcode')}
              onBlur={() => setDraft((d) => ({ ...d, postcode: d.postcode.trim() ? normalizePostcode(country, d.postcode) : '' }))}
              sx={{ width: 120 }}
            />
            <TextField label="City" value={draft.locality} onChange={edit('locality')} sx={{ flex: 1, minWidth: 140 }} />
            <TextField select label="Country" value={country} onChange={edit('countryCode')} sx={{ width: 160 }}>
              {(COUNTRIES.includes(country) ? COUNTRIES : [country, ...COUNTRIES]).map((c) => (
                <MenuItem key={c} value={c}>{regionNames.of(c) ?? c}</MenuItem>
              ))}
            </TextField>
          </WrapRow>
          <WrapRow sx={{ my: 0 }}>
            {sameAs.map((p) => (
              <Chip key={p.placeId} icon={<HomeIcon />} label={`Same as ${p.who}`} title={p.label} onClick={() => done(selectPlace(p.placeId, p.label, 'prediction'))} />
            ))}
            <Chip icon={<SearchIcon />} label="Use existing place" onClick={() => setDialog('search')} />
            <Chip icon={<PinDropIcon />} label="Pick on map" onClick={() => setDialog('pin')} />
            {value && <Chip variant="outlined" label={`Keep ${value.label || 'current place'}`} onClick={() => setEditing(false)} />}
          </WrapRow>
        </>
      )}
      <PlaceSearchDialog open={dialog === 'search'} context={context} onClose={() => setDialog(null)} onPicked={(s) => done(s)} />
      {(dialog === 'pin' || dialog === 'adjust') && (
        <PinPlaceDialog
          start={dialog === 'adjust' && currentPoint ? { ...currentPoint, zoom: TARGET_ZOOM } : pinStart({ origin, hits: lookup.hits })}
          initialPin={dialog === 'adjust' ? currentPoint : null}
          nameRequired={pinNameRequired(context)}
          busy={pin.isPending}
          error={pin.error ? errText(pin.error) : null}
          onCancel={() => {
            pin.reset();
            setDialog(null);
          }}
          onConfirm={(point, name) => pin.mutate({ ...point, name }, { onSuccess: (s) => done(s) })}
        />
      )}
    </Box>
  );
}
