import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import {
  type DayRange, fmtMonth, fmtPhotoRange, monthRange, photoTimeline, type TimelineYear, wholeSpan, yearRange,
} from '@lupira/cal-domain/photoTimeline';
import type { PhotoStats } from '@lupira/cal-api/models';
import type { PhotoFilters } from '../../../state/usePhotoLibrary';

type Props = {
  stats: PhotoStats | undefined;
  filters: PhotoFilters;
  onChange: (range: DayRange | null) => void;
};

function useTimeline(stats: PhotoStats | undefined, filters: PhotoFilters) {
  const years = useMemo(
    () => photoTimeline(stats?.byMonth ?? {}, filters.sort !== 'TakenAtAsc'),
    [stats, filters.sort],
  );
  const span = filters.from ? wholeSpan(filters.from, filters.to || filters.from) : null;
  return { years, span };
}

/** Every month in the library, not only the loaded pages — a pick filters to it, so 2019 is one
 *  click away rather than a scroll through everything since. Desktop only; phones get the select. */
export function PhotoTimelineRail({ stats, filters, onChange }: Props) {
  const { years, span } = useTimeline(stats, filters);
  if (years.length === 0 || (years.length === 1 && years[0].months.length === 1)) return null;

  const openYear = span?.kind === 'year' ? span.year : span?.kind === 'month' ? span.key.slice(0, 4) : null;
  const railButton = (active: boolean) => ({
    minWidth: 0, px: 1, justifyContent: 'space-between', gap: 1,
    color: active ? 'primary.main' : 'text.subtle', fontWeight: active ? 700 : 400,
  });

  return (
    <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', width: 112, overflowY: 'auto', pl: 1 }}>
      <Button size="small" onClick={() => onChange(null)} sx={railButton(!filters.from)}>All</Button>
      {years.map((y) => (
        <Box key={y.year} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Button size="small" onClick={() => onChange(yearRange(y.year))} sx={railButton(span?.kind === 'year' && span.year === y.year)}>
            <span>{y.year}</span>
            <Box component="span" sx={{ color: 'text.subtle', fontWeight: 400 }}>{y.count}</Box>
          </Button>
          {openYear === y.year && y.months.map((m) => (
            <Button
              key={m.key}
              size="small"
              onClick={() => onChange(monthRange(m.key))}
              sx={{ ...railButton(span?.kind === 'month' && span.key === m.key), pl: 2 }}
            >
              <span>{fmtMonth(m.key, 'short')}</span>
              <Box component="span" sx={{ color: 'text.subtle', fontWeight: 400 }}>{m.count}</Box>
            </Button>
          ))}
        </Box>
      ))}
    </Box>
  );
}

const optionValue = (span: ReturnType<typeof wholeSpan>) =>
  span?.kind === 'year' ? `year:${span.year}` : span?.kind === 'month' ? `month:${span.key}` : '';

/** The rail's options as one select, for widths with no room for a rail. */
export function PhotoWhenSelect({ stats, filters, onChange }: Props) {
  const { years, span } = useTimeline(stats, filters);
  const custom = filters.from && !span;
  const value = custom ? 'custom' : optionValue(span);

  const onSelect = (v: string) => {
    if (!v) onChange(null);
    else if (v.startsWith('year:')) onChange(yearRange(v.slice(5)));
    else if (v.startsWith('month:')) onChange(monthRange(v.slice(6)));
  };

  return (
    <TextField select size="small" label="When" value={value} onChange={(e) => onSelect(e.target.value)} sx={{ minWidth: 150 }}>
      <MenuItem value="">Any time</MenuItem>
      {custom && <MenuItem value="custom" disabled>{fmtPhotoRange(filters.from, filters.to)}</MenuItem>}
      {years.flatMap((y: TimelineYear) => [
        <MenuItem key={y.year} value={`year:${y.year}`} sx={{ fontWeight: 600 }}>{y.year} · {y.count}</MenuItem>,
        ...y.months.map((m) => (
          <MenuItem key={m.key} value={`month:${m.key}`} sx={{ pl: 4 }}>
            {fmtMonth(m.key, 'long')} {y.year} · {m.count}
          </MenuItem>
        )),
      ])}
    </TextField>
  );
}
