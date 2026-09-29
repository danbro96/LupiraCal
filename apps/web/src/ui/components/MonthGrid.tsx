import { useState } from 'react';
import { NamedIcon } from './KindIcon';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import type { AvailabilitySegment } from '../../state/useAvailability';
import { familyKey } from '@lupira/cal-domain/family';
import { compareDayEntries } from '@lupira/cal-domain/occurrences';
import { fmtTime, isToday, weekdayNames } from '@lupira/cal-domain/time';
import { availabilityColor } from '@lupira/cal-tokens/kinds';
import { familyAccent } from '../theme/kinds';
import { coversDay, segmentSpan, type GridEntry } from '../entries';

const MAX_PER_CELL = 4;
const WEEKDAYS = weekdayNames();
const orderKey = (e: GridEntry) => ({ allDay: e.isAllDay, start: e.start.getTime() });

const DOT = { borderRadius: '999px', flex: 'none' } as const;

/** Chip styling, spread in cascade order: a ghost's dashed border must beat a deadline's solid one,
 *  and a dimmed family's opacity must beat a ghost's. Order here is what used to be !important. */
function chipSx(e: GridEntry, accent: string | undefined, fam: 'hi' | 'dim' | null) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    border: 0,
    borderLeft: '3px solid',
    borderColor: e.color,
    borderRadius: '3px',
    bgcolor: 'background.paper',
    color: 'text.primary',
    fontSize: 12,
    p: '1px 4px',
    textAlign: 'left',
    minWidth: 0,
    justifyContent: 'flex-start',
    ...(e.task && { borderWidth: 1, borderStyle: 'solid', borderLeftWidth: 3 }),
    ...(e.status === 'Cancelled' && { opacity: 0.6 }),
    ...(e.ghost && { opacity: 0.55, borderStyle: 'dashed' }),
    ...(fam === 'hi' && accent && { boxShadow: `0 0 0 2px ${accent}` }),
    ...(fam === 'dim' && { opacity: 0.35 }),
    '@media (prefers-reduced-motion: no-preference)': {
      transition: 'opacity 120ms ease, box-shadow 120ms ease',
    },
  };
}

interface Props {
  date: Date;
  weeks: Date[][];
  entries: GridEntry[];
  segments: AvailabilitySegment[];
  /** Phone treatment: each cell is one tap-to-day button showing event dots instead of chips. */
  compact?: boolean;
  onOpenItem: (id: string) => void;
  onOpenDay: (d: Date) => void;
  selectedFamilyKey?: string;
}

export function MonthGrid({ date, weeks, entries, segments, compact, onOpenItem, onOpenDay, selectedFamilyKey }: Props) {
  const [hoverFamily, setHoverFamily] = useState<string | null>(null);
  const activeFamily = hoverFamily ?? selectedFamilyKey ?? null;
  const fam = (key: string | undefined): 'hi' | 'dim' | null =>
    activeFamily ? (key === activeFamily ? 'hi' : 'dim') : null;

  return (
    <Box
      sx={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        // 'auto' rather than the minmax the cells' own min-height already enforces.
        gridAutoRows: compact ? 'minmax(52px, 1fr)' : 'auto',
        ...(compact && { gridTemplateRows: 'max-content' }),
        borderTop: 1,
        borderLeft: 1,
        borderColor: 'divider',
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      {WEEKDAYS.map((d) => (
        <Box
          key={d}
          sx={{
            gridRow: 1,
            p: '4px 8px',
            fontSize: 12,
            fontWeight: 700,
            color: 'text.subtle',
            borderRight: 1,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          {d}
        </Box>
      ))}
      {weeks.flat().map((day) => {
        const dayEntries = entries
          .filter((e) => coversDay(e, day))
          .sort((a, b) => compareDayEntries(orderKey(a), orderKey(b)));
        const shown = dayEntries.slice(0, MAX_PER_CELL);
        const daySegments = segments.filter((s) => coversDay(segmentSpan(s), day));
        const otherMonth = day.getMonth() !== date.getMonth();
        const cellSx = {
          borderRight: 1,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          ...(otherMonth && { bgcolor: 'background.paper', opacity: 0.75 }),
        };

        if (compact)
          return (
            <ButtonBase
              key={day.toISOString()}
              onClick={() => onOpenDay(day)}
              sx={{ ...cellSx, alignItems: 'center', gap: '4px', p: '4px 2px 6px', minHeight: 52 }}
            >
              <DayNumber day={day} />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '3px', minHeight: 7 }}>
                {shown.map((e) => (
                  <Box
                    key={e.key}
                    component="span"
                    sx={{
                      ...DOT,
                      width: 7,
                      height: 7,
                      // Square dot = deadline in the compact cells.
                      ...(e.task && { borderRadius: '2px' }),
                      ...(e.ghost && { opacity: 0.55 }),
                    }}
                    style={{ background: e.color }}
                  />
                ))}
                {dayEntries.length > shown.length && (
                  <Box component="span" sx={{ fontSize: 10, color: 'text.subtle', lineHeight: 1 }}>
                    +{dayEntries.length - shown.length}
                  </Box>
                )}
              </Box>
              {daySegments.length > 0 && <AvailDots segments={daySegments} />}
            </ButtonBase>
          );

        return (
          <Box key={day.toISOString()} sx={{ ...cellSx, gap: '2px', p: '2px 4px 6px', minHeight: 110 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <DayNumber day={day} onClick={() => onOpenDay(day)} />
              <AvailDots segments={daySegments} titled />
            </Box>
            {shown.map((e) => {
              const fk = familyKey(e);
              const accent = fk ? familyAccent(fk) : undefined;
              return (
                <ButtonBase
                  key={e.key}
                  sx={chipSx(e, accent, fam(fk))}
                  onClick={() => onOpenItem(e.itemId)}
                  onMouseEnter={fk ? () => setHoverFamily(fk) : undefined}
                  onMouseLeave={fk ? () => setHoverFamily(null) : undefined}
                  title={e.ghost ? `${e.title} (proposed)` : e.task ? `${e.title} — due ${fmtTime(e.task.dueAt)}` : e.title}
                >
                  <Box component="span" sx={{ ...DOT, width: 7, height: 7 }} style={{ background: e.color }} />
                  {!e.isAllDay && (
                    <Box component="span" sx={{ color: 'text.subtle', flex: 'none' }}>
                      {fmtTime(e.start)}
                    </Box>
                  )}
                  <Box
                    component="span"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      ...(e.task?.overdue && { color: 'error.main' }),
                      ...(e.status === 'Cancelled' && { textDecoration: 'line-through' }),
                    }}
                  >
                    {e.icon && <NamedIcon name={e.icon} sx={{ verticalAlign: -2, mr: 0.25 }} />}
                    {e.title}
                    {e.ghost ? ' (proposed)' : ''}
                  </Box>
                  {accent && (
                    <Box
                      component="span"
                      sx={{ ...DOT, width: 6, height: 6, ml: 'auto' }}
                      style={{ background: accent }}
                    />
                  )}
                </ButtonBase>
              );
            })}
            {dayEntries.length > shown.length && (
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => onOpenDay(day)}
                sx={{
                  alignSelf: 'flex-start',
                  fontSize: 12,
                  fontWeight: 600,
                  p: '2px',
                  whiteSpace: 'nowrap',
                  '@media (pointer: coarse)': { p: '6px 2px' },
                }}
              >
                +{dayEntries.length - shown.length} more
              </Link>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** The date, circled when it's today. Grows on touch, where 26px is under the target size. */
function DayNumber({ day, onClick }: { day: Date; onClick?: () => void }) {
  const today = isToday(day);
  return (
    <IconButton
      component={onClick ? 'button' : 'span'}
      onClick={onClick}
      disableRipple={!onClick}
      sx={{
        width: 26,
        height: 26,
        fontSize: 13,
        fontWeight: 600,
        color: today ? 'primary.contrastText' : 'text.secondary',
        ...(today && { bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.main' } }),
        '@media (pointer: coarse)': { width: 36, height: 36 },
      }}
    >
      {day.getDate()}
    </IconButton>
  );
}

function AvailDots({ segments, titled }: { segments: AvailabilitySegment[]; titled?: boolean }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', gap: '3px' }}>
      {segments.map((s, i) => (
        <Box
          key={i}
          component="span"
          title={titled ? s.status : undefined}
          sx={{ ...DOT, width: 8, height: 8 }}
          style={{ background: availabilityColor(s.status) }}
        />
      ))}
    </Box>
  );
}
