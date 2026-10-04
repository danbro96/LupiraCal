import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { getForwardGeocodeQueryOptions, useSuggestPlaces } from '@lupira/cal-api/query/geo';
import { SuggestionType, type PlaceSuggestionDto } from '@lupira/cal-api/models';
import { MIN_PLACE_QUERY } from '@lupira/cal-domain/placeCandidates';
import Box from '@mui/material/Box';
import { RowName } from '../Rows';

export interface SearchTarget {
  lat: number;
  lon: number;
  /** Set only for gazetteer places — opens the detail panel too. */
  placeId?: string;
}

/** Synthetic option offering the nominatim fallback when the gazetteer has no match. */
type GeocodeFallback = { geocode: true };
type SearchOption = PlaceSuggestionDto | GeocodeFallback;
const isFallback = (o: SearchOption): o is GeocodeFallback => 'geocode' in o;

/** Gazetteer typeahead (places + localities) with a nominatim forward-geocode fallback. */
export function MapSearch({ onPick }: { onPick: (target: SearchTarget) => void }) {
  const [q, setQ] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const queryClient = useQueryClient();

  const suggestQ = useSuggestPlaces({ q }, { query: { enabled: q.trim().length >= MIN_PLACE_QUERY } });
  const suggestions = q.trim().length >= MIN_PLACE_QUERY ? (suggestQ.data ?? []) : [];

  const geocode = (text: string) => {
    setGeocoding(true);
    queryClient
      .fetchQuery(getForwardGeocodeQueryOptions({ q: text, limit: 1 }, { query: { staleTime: Infinity } }))
      .then(([hit]) => {
        setGeocoding(false);
        if (hit?.latitude != null && hit.longitude != null) {
          setQ('');
          onPick({ lat: hit.latitude, lon: hit.longitude });
        }
      }, () => setGeocoding(false));
  };

  const pick = (id: string, type: SuggestionType, lat?: number | null, lon?: number | null) => {
    setQ('');
    if (lat == null || lon == null) return;
    onPick({ lat, lon, placeId: type === SuggestionType.Place ? id : undefined });
  };

  const options: SearchOption[] =
    suggestions.length > 0
      ? suggestions
      : q.trim().length >= MIN_PLACE_QUERY && !suggestQ.isLoading
        ? [{ geocode: true }]
        : [];

  return (
    <Box sx={{ position: 'relative', minWidth: 220 }}>
      <Autocomplete<SearchOption, false, false, true>
        freeSolo
        options={options}
        filterOptions={(x) => x}
        loading={q.trim().length >= MIN_PLACE_QUERY && suggestQ.isLoading}
        value={null}
        inputValue={q}
        onInputChange={(_, v) => setQ(v)}
        onChange={(_, value) => {
          if (typeof value === 'string') {
            if (suggestions.length === 0 && value.trim().length >= MIN_PLACE_QUERY) geocode(value.trim());
          } else if (value && isFallback(value)) {
            geocode(q.trim());
          } else if (value) {
            pick(value.id, value.type, value.latitude, value.longitude);
          }
        }}
        getOptionKey={(o) => (typeof o === 'string' ? o : isFallback(o) ? 'geocode' : `${o.type}:${o.id}`)}
        getOptionLabel={(o) => (typeof o === 'string' ? o : isFallback(o) ? q.trim() : o.name)}
        getOptionDisabled={(o) => isFallback(o) && geocoding}
        renderOption={({ key, ...props }, o) => (
          <li key={key} {...props}>
            {isFallback(o) ? (
              geocoding ? 'Searching…' : `Search address "${q.trim()}"`
            ) : (
              <>
                <RowName>{o.name}</RowName>
                {o.context && <Typography variant="caption" sx={{ color: 'text.secondary' }}> {o.context}</Typography>}
                <Chip variant="outlined" label={o.type === SuggestionType.Place ? o.category ?? 'Place' : 'Area'} />
              </>
            )}
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Search places…"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQ('');
            }}
            // Opaque for map-overlay legibility.
            sx={{ bgcolor: 'background.default', borderRadius: 1, boxShadow: '0 1px 4px rgb(0 0 0 / 0.15)' }}
          />
        )}
      />
    </Box>
  );
}
