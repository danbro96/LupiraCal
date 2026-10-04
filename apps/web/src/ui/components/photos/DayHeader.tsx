import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { useGetItem } from '@lupira/cal-api/query/cal';
import { linkedEventIds, topPlaces } from '@lupira/cal-domain/photoFormat';
import type { PhotoDay } from '../../../state/usePhotoLibrary';
import { CalendarIcon, MapIcon } from '@danbro96/lupira-web-mui/icons';

/** A day's date, where it was and what it was — each a way to narrow the grid to it. */
export function DayHeader({ day, links, selecting, allSelected, onToggleDay, onPlace, onEvent }: {
  day: PhotoDay;
  links: ReadonlyMap<string, readonly string[]>;
  selecting: boolean;
  allSelected: boolean;
  onToggleDay: () => void;
  onPlace: (label: string) => void;
  onEvent: (eventId: string) => void;
}) {
  const places = topPlaces(day.items, 2);
  const eventIds = linkedEventIds(day.items.map((i) => i.id), links).slice(0, 3);
  const located = day.items.some((i) => i.latitude != null);

  return (
    <Box
      sx={{
        position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1,
        bgcolor: 'background.default', py: 0.5,
      }}
    >
      <Typography variant="overline" sx={{ color: 'text.subtle' }}>{day.label}</Typography>
      {places.map((label) => (
        <Link
          key={label}
          component="button"
          variant="caption"
          underline="hover"
          onClick={() => onPlace(label)}
          sx={{ color: 'text.subtle' }}
        >
          {label}
        </Link>
      ))}
      {eventIds.map((id) => <DayEvent key={id} itemId={id} onClick={() => onEvent(id)} />)}
      {located && (
        <Tooltip title="Show this day on the map">
          <IconButton
            size="small"
            component={RouterLink}
            to={`/locations?from=${day.key}&to=${day.key}&layers=photos`}
            aria-label="Show this day on the map"
          >
            <MapIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Button
        size="small"
        data-reveal
        onClick={onToggleDay}
        sx={{ opacity: selecting ? 1 : 0, '&:focus-visible': { opacity: 1 }, '@media (hover: none)': { opacity: 1 } }}
      >
        {allSelected ? 'Deselect day' : 'Select day'}
      </Button>
    </Box>
  );
}

function DayEvent({ itemId, onClick }: { itemId: string; onClick: () => void }) {
  const { data: item } = useGetItem(itemId);
  return <Chip size="small" icon={<CalendarIcon />} label={item?.title ?? 'Event'} onClick={onClick} />;
}
