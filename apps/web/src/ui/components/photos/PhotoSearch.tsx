import { useMemo, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSearchItems } from '@lupira/cal-api/query/cal';
import { useListPhotoPlaces } from '@lupira/cal-api/query/photo';
import type { PhotoStats } from '@lupira/cal-api/models';
import { type DayRange, matchTimeline, photoTimeline } from '@lupira/cal-domain/photoTimeline';
import { fmtWhen } from '@lupira/cal-domain/time';
import { RowName } from '../Rows';

type Suggestion =
  | { kind: 'date'; key: string; label: string; detail: string; range: DayRange }
  | { kind: 'event'; key: string; label: string; detail: string; id: string }
  | { kind: 'place'; key: string; label: string; detail: string };

const GROUP = { date: 'Dates', event: 'Events', place: 'Places' } as const;
const MIN_QUERY = 2;

/** One box for the three ways people remember a photo: when, at what, and where. Enter on free text
 *  filters by place, as the old place field did. */
export function PhotoSearch({ stats, newestFirst, onDate, onEvent, onPlace }: {
  stats: PhotoStats | undefined;
  newestFirst: boolean;
  onDate: (range: DayRange) => void;
  onEvent: (eventId: string) => void;
  onPlace: (label: string) => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim();
  const active = term.length >= MIN_QUERY;

  const timeline = useMemo(() => photoTimeline(stats?.byMonth ?? {}, newestFirst), [stats, newestFirst]);
  const events = useSearchItems({ query: term, take: 6, desc: true }, { query: { enabled: active } });
  const places = useListPhotoPlaces({ q: term, limit: 5 }, { query: { enabled: active } });

  const options: Suggestion[] = active
    ? [
      ...matchTimeline(timeline, term, 4).map((m) => ({
        kind: 'date' as const, key: `date:${m.range.from}:${m.range.to}`, label: m.label, detail: `${m.count}`, range: m.range,
      })),
      ...(events.data ?? []).map((e) => ({
        kind: 'event' as const, key: `event:${e.id}`, label: e.title ?? 'Untitled event', detail: fmtWhen(e.start, e.isAllDay), id: e.id,
      })),
      ...(places.data ?? []).map((p) => ({
        kind: 'place' as const, key: `place:${p.label}`, label: p.label, detail: `${p.count}`,
      })),
    ]
    : [];

  const pick = (value: Suggestion | string | null) => {
    if (!value) return;
    if (typeof value === 'string') {
      if (value.trim()) onPlace(value.trim());
    } else if (value.kind === 'date') {
      onDate(value.range);
    } else if (value.kind === 'event') {
      onEvent(value.id);
    } else {
      onPlace(value.label);
    }
    setQ('');
  };

  return (
    <Autocomplete<Suggestion, false, false, true>
      freeSolo
      size="small"
      options={options}
      filterOptions={(x) => x}
      groupBy={(o) => GROUP[o.kind]}
      loading={active && (events.isLoading || places.isLoading)}
      value={null}
      inputValue={q}
      onInputChange={(_, v, reason) => { if (reason !== 'reset') setQ(v); }}
      onChange={(_, value) => pick(value)}
      getOptionKey={(o) => (typeof o === 'string' ? o : o.key)}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
      renderOption={({ key, ...props }, o) => (
        <li key={key} {...props}>
          <RowName>{o.label}</RowName>
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>{o.detail}</Typography>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search"
          placeholder="Event, place or month"
          onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }}
        />
      )}
      sx={{ minWidth: 220 }}
    />
  );
}
