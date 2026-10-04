import { Link, useSearchParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import type { CalendarItemDto } from '@lupira/cal-api/models';
import { addressMeta, residentsByPlace } from '@lupira/cal-domain/residents';
import { formatCoords, osmUrl } from '@lupira/cal-domain/places';
import { fmtDate, fmtDateTime, parseYmd } from '@lupira/cal-domain/time';
import { useGeoPlace, usePlaceItems } from '../../../state/usePlaces';
import { useResidencyRows } from '../../../state/useResidencies';
import { EntryCodes } from '../places/EntryCodes';
import { CategoryIcon } from '../KindIcon';
import { DrawerSection } from '../DrawerSection';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import { displayTitle } from '@lupira/cal-domain/itemLabels';
import { Row, RowName } from '../Rows';
import { PlaceIcon } from '../../icons';

/** The ?place= detail pane (extracted from the former LocationsScreen): containment, items, contacts. */
export function PlaceDetailPanel({ placeId, onClose }: { placeId: string; onClose: () => void }) {
  const { data: place, isLoading } = useGeoPlace(placeId);

  return (
    <Paper
      component="aside"
      elevation={4}
      sx={{
        position: 'absolute',
        zIndex: 6,
        top: { xs: 'auto', sm: 1.5 },
        right: 1.5,
        left: { xs: 1.5, sm: 'auto' },
        bottom: { xs: 'calc(64px + 12px)', sm: 1.5 },
        maxHeight: { xs: '45vh', sm: 'none' },
        width: { xs: 'auto', sm: 'min(360px, calc(100vw - 24px))' },
        overflowY: 'auto',
        borderRadius: '12px',
        p: 1.5,
      }}
    >
      <IconButton onClick={onClose} aria-label="Close" sx={{ position: 'absolute', top: 4, right: 4 }}>
        <CloseIcon fontSize="small" />
      </IconButton>
      {isLoading && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Loading…</Typography>}
      {!isLoading && !place && <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>Place not found.</Typography>}
      {place && (
        <>
          <Paper variant="outlined" component="section" sx={{ p: '12px 16px', my: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <h3 style={{ margin: 0, flex: 1 }}>{place.name}</h3>
              <Chip variant="outlined" label={place.category} />
            </Box>
            {(place.containment ?? []).length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, fontSize: 13 }}>
                {(place.containment ?? []).map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && <Box component="span" sx={{ color: 'text.subtle' }}> › </Box>}
                    {a.name}
                  </span>
                ))}
              </Box>
            )}
            {place.formattedAddress && <Typography component="p" sx={{ mb: 1, color: 'text.secondary' }}>{place.formattedAddress}</Typography>}
            {formatCoords(place.latitude, place.longitude) && (
              <Typography component="p" sx={{ mb: 1, color: 'text.secondary' }}>
                <PlaceIcon fontSize="small" sx={{ verticalAlign: -5, mr: 0.5 }} />{formatCoords(place.latitude, place.longitude)}
                {osmUrl(place.latitude, place.longitude) && (
                  <>
                    {' '}
                    <Button
                      variant="text"
                      href={osmUrl(place.latitude, place.longitude)!}
                      target="_blank"
                      rel="noreferrer"
                    >
                      OSM ↗
                    </Button>
                  </>
                )}
              </Typography>
            )}
          </Paper>
          <ItemsPanel placeId={placeId} />
          <ContactsPanel placeId={placeId} />
        </>
      )}
    </Paper>
  );
}

function ItemsPanel({ placeId }: { placeId: string }) {
  const [params] = useSearchParams();
  const { data: items, isLoading } = usePlaceItems(placeId);

  const itemHref = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('item', id);
    return `?${next.toString()}`;
  };

  return (
    <DrawerSection title="Items here">
      {isLoading && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Loading…</Typography>}
      {!isLoading && (items ?? []).length === 0 && <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>No items reference this place.</Typography>}
      {(items ?? []).map((item) => (
        <Row component={Link} key={item.id} to={itemHref(item.id)}>
          {item.category && (
            <CategoryIcon category={item.category} sx={{ fontSize: 22 }} />
          )}
          <RowName>{displayTitle(item.title)}</RowName>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{whenOf(item)}</Typography>
          {roleOf(item, placeId) && <Chip variant="outlined" label={roleOf(item, placeId)} />}
        </Row>
      ))}
    </DrawerSection>
  );
}

function ContactsPanel({ placeId }: { placeId: string }) {
  const { rows } = useResidencyRows();
  const residents = residentsByPlace(rows.filter((r) => r.placeId === placeId)).get(placeId);
  if (!residents) return null;
  return (
    <DrawerSection title="Contacts here">
      <EntryCodes placeId={placeId} editable />
      {[...residents.active, ...residents.other].map((r) => (
        <Row component={Link} key={`${r.contactId}-${r.status}`} to={`/contacts/${r.contactId}`}>
          <RowName>{r.displayName}</RowName>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{addressMeta({ ...r, type: r.addressType })}</Typography>
        </Row>
      ))}
    </DrawerSection>
  );
}

/** Which role the place plays for an item: its location, or a travel endpoint. */
function roleOf(item: CalendarItemDto, placeId: string): string {
  if (item.placeId === placeId) return 'At';
  const t = item.details?.travel;
  if (t?.toPlaceId === placeId) return 'To';
  if (t?.fromPlaceId === placeId) return 'From';
  return '';
}

function whenOf(item: CalendarItemDto): string {
  if (item.isAllDay) return item.startDate ? fmtDate(parseYmd(item.startDate)) : '';
  return item.startsAt ? fmtDateTime(new Date(item.startsAt)) : '';
}
