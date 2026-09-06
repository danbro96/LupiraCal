import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { fmtDuration } from '@lupira/cal-domain/photoFormat';
import { parseYmd } from '@lupira/cal-domain/time';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { errText } from '../errText';
import { WrapRow } from '../components/WrapRow';
import { PhotoViewer } from '../components/photos/PhotoViewer';
import {
  groupByDay, PHOTO_PAGE_SIZE, usePhotoEventLinks, usePhotoFilters, usePhotoLibrary,
} from '../../state/usePhotoLibrary';

/** The whole library, not just the geotagged slice the map shows. Day-grouped, cursor-paged, with the
 *  viewer behind `?photo=`. */
function dayRangeLabel(from: string, to: string): string {
  const start = parseYmd(from).toLocaleDateString(undefined, { dateStyle: 'medium' });
  if (!to || to === from) return start;
  return `${start} – ${parseYmd(to).toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

export default function PhotosScreen() {
  const [params, setParams] = useSearchParams();
  const filters = usePhotoFilters();
  const links = usePhotoEventLinks();
  const { items, isLoading, isFetching, error, hasNextPage, fetchNextPage, isFetchingNextPage } = usePhotoLibrary(filters);

  const setParam = useCallback((key: string, value: string | undefined) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true }), [setParams]);

  // The event filter is resolved client-side off the link map: the photo API has no notion of events.
  const shown = useMemo(() => {
    if (!filters.event) return items;
    return items.filter((i) => links.get(i.id)?.includes(filters.event));
  }, [items, links, filters.event]);

  const days = useMemo(() => groupByDay(shown), [shown]);
  const months = useMemo(() => [...new Set(days.map((d) => d.key.slice(0, 7)))], [days]);

  const openPhoto = params.get('photo');
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: { xs: 2, md: '16px 24px' } }}>
      <WrapRow>
        <Typography component="h2" variant="h6" sx={{ mr: 1 }}>Photos</Typography>
        <TextField
          select size="small" label="Sort" value={filters.sort}
          onChange={(e) => setParam('sort', e.target.value === 'TakenAtDesc' ? undefined : e.target.value)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="TakenAtDesc">Newest first</MenuItem>
          <MenuItem value="TakenAtAsc">Oldest first</MenuItem>
        </TextField>
        <TextField
          select size="small" label="Type" value={filters.kind}
          onChange={(e) => setParam('kind', e.target.value || undefined)}
          sx={{ minWidth: 130 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="Photo">Photos</MenuItem>
          <MenuItem value="Video">Videos</MenuItem>
        </TextField>
        <TextField
          select size="small" label="Location" value={filters.located}
          onChange={(e) => setParam('located', e.target.value || undefined)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">Anywhere</MenuItem>
          <MenuItem value="true">Has a place</MenuItem>
          <MenuItem value="false">No location</MenuItem>
        </TextField>
        <TextField
          size="small" label="Place" defaultValue={filters.place}
          onBlur={(e) => setParam('place', e.target.value.trim() || undefined)}
          onKeyDown={(e) => { if (e.key === 'Enter') setParam('place', (e.target as HTMLInputElement).value.trim() || undefined); }}
          sx={{ minWidth: 160 }}
        />
        <TextField
          select size="small" label="Status" value={filters.status}
          onChange={(e) => setParam('status', e.target.value || undefined)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="Ready">Ready</MenuItem>
          <MenuItem value="Failed">Failed</MenuItem>
          <MenuItem value="Duplicate">Duplicates</MenuItem>
        </TextField>
        {filters.from && (
          <Chip
            label={dayRangeLabel(filters.from, filters.to)}
            onDelete={() => setParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('from');
              next.delete('to');
              return next;
            }, { replace: true })}
          />
        )}
        {filters.event && (
          <Chip label="From one event" onDelete={() => setParam('event', undefined)} />
        )}
        {isFetching && <Typography variant="caption" sx={{ color: 'text.subtle' }}>Loading…</Typography>}
      </WrapRow>

      {error && (
        <Typography component="p" sx={{ textAlign: 'center', color: 'error.main', mt: 6 }}>
          {errText(error) ?? 'Could not load photos.'}
        </Typography>
      )}

      {!error && !isLoading && shown.length === 0 && (
        <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>
          {items.length === 0 ? 'No photos yet.' : 'No photos match these filters.'}
        </Typography>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {days.map((day) => (
            <Box key={day.key} id={`day-${day.key}`} component="section">
              <Typography
                variant="overline"
                sx={{
                  position: 'sticky', top: 0, zIndex: 1, display: 'block',
                  bgcolor: 'background.default', py: 0.5, color: 'text.subtle',
                }}
              >
                {day.label}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1, mb: 2 }}>
                {day.items.map((item) => (
                  <PhotoTile
                    key={item.id}
                    item={item}
                    linked={(links.get(item.id)?.length ?? 0) > 0}
                    onOpen={() => setParam('photo', item.id)}
                  />
                ))}
              </Box>
            </Box>
          ))}

          <div ref={sentinel} />
          {hasNextPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
              <Button variant="outlined" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : `Load ${PHOTO_PAGE_SIZE} more`}
              </Button>
            </Box>
          )}
        </Box>

        {months.length > 1 && (
          <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', gap: 0.5, pl: 1, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
            {months.map((month) => (
              <Button
                key={month}
                size="small"
                sx={{ minWidth: 0, px: 0.5, color: 'text.subtle' }}
                onClick={() => document.getElementById(`day-${days.find((d) => d.key.startsWith(month))!.key}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {month}
              </Button>
            ))}
          </Box>
        )}
      </Box>

      {openPhoto && (
        <PhotoViewer
          photoId={openPhoto}
          siblings={shown}
          onClose={() => setParam('photo', undefined)}
          onNavigate={(id) => setParam('photo', id)}
        />
      )}
    </Box>
  );
}

function PhotoTile({ item, linked, onOpen }: { item: PhotoListItemDto; linked: boolean; onOpen: () => void }) {
  // Reserve the tile's shape before the image loads; an unprocessed asset has no dimensions yet.
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : '1 / 1';
  return (
    <Box
      onClick={onOpen}
      sx={{
        position: 'relative', cursor: 'pointer', borderRadius: 1, overflow: 'hidden',
        bgcolor: 'action.hover', '&:hover': { opacity: 0.9 },
      }}
      style={{ aspectRatio: ratio }}
    >
      {item.thumbUrl ? (
        <Box component="img" src={item.thumbUrl} alt="" loading="lazy"
          sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Typography variant="caption" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'text.subtle' }}>
          {item.status === 'Failed' ? 'Failed' : 'Processing…'}
        </Typography>
      )}
      {item.durationSeconds != null && (
        <Typography variant="caption" sx={{ position: 'absolute', right: 4, bottom: 4, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff' }}>
          {fmtDuration(item.durationSeconds)}
        </Typography>
      )}
      {linked && (
        <Box sx={{ position: 'absolute', left: 4, top: 4, px: 0.5, borderRadius: 0.5, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11 }}>
          event
        </Box>
      )}
    </Box>
  );
}
