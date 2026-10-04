import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { addMonths, fmtMonthTitle, isToday, monthMatrix, sameDay, startOfMonth } from '@danbro96/lupira-domain-core/time';

interface Props {
  /** The date to highlight as current. */
  selected: Date;
  anchorEl: HTMLElement | null;
  onPick: (d: Date) => void;
  onClose: () => void;
}

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const GRID = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' } as const;

/** Small month calendar for jumping the day/week view to any date (keeps the current view). */
export function MiniMonthPicker({ selected, anchorEl, onPick, onClose }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(selected));
  const weeks = monthMatrix(cursor);

  return (
    <Popover
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: {
          'aria-label': 'Pick a date',
          sx: { width: 260, maxWidth: 'calc(100vw - 32px)', p: 1 },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <IconButton onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{fmtMonthTitle(cursor)}</Typography>
        <IconButton onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={GRID}>
        {DOW.map((d) => (
          <Typography
            key={d}
            variant="caption"
            sx={{ py: '2px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'text.subtle' }}
          >
            {d}
          </Typography>
        ))}
        {weeks.flat().map((day) => {
          const outside = day.getMonth() !== cursor.getMonth();
          const chosen = sameDay(day, selected);
          const today = isToday(day);
          return (
            <IconButton
              key={day.toISOString()}
              onClick={() => onPick(day)}
              sx={{
                aspectRatio: '1',
                fontSize: 13,
                color: outside ? 'text.disabled' : today ? 'primary.main' : 'text.primary',
                fontWeight: today ? 700 : 400,
                ...(chosen && { bgcolor: 'primary.main', color: 'primary.contrastText' }),
              }}
            >
              {day.getDate()}
            </IconButton>
          );
        })}
      </Box>
    </Popover>
  );
}
