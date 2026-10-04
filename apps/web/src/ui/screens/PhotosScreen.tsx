import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useGetItem } from '@lupira/cal-api/query/cal';
import {
  fmtDuration, outcomeMessage, PHOTO_TEXT, photoCount, purgeWarning, trashBadge,
} from '@lupira/cal-domain/photoFormat';
import { fmtPhotoRange } from '@lupira/cal-domain/photoTimeline';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { photoEmptyText } from '@lupira/cal-domain/photoFilter';
import { SCRIM } from '@lupira/cal-tokens/color';
import { usePhotoActions } from '../../state/usePhotoActions';
import { errText } from '../errText';
import { CalendarIcon, CheckboxBlankIcon, CheckboxIcon, CloseIcon, DeleteIcon, PlaceIcon } from '../icons';
import { useSnackbar } from '../components/SnackbarHost';
import { WrapRow } from '../components/WrapRow';
import { DayHeader } from '../components/photos/DayHeader';
import { LinkEventDialog } from '../components/photos/LinkEventDialog';
import { PhotoSearch } from '../components/photos/PhotoSearch';
import { PhotoTimelineRail, PhotoWhenSelect } from '../components/photos/PhotoTimeline';
import { PhotoViewer } from '../components/photos/PhotoViewer';
import {
  groupByDay, PHOTO_PAGE_SIZE, usePhotoEventLinks, usePhotoFilters, usePhotoLibrary, usePhotoStats,
} from '../../state/usePhotoLibrary';

/** The whole library, not just the geotagged slice the map shows. Day-grouped, cursor-paged, with the
 *  viewer behind `?photo=`. */
export default function PhotosScreen() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const filters = usePhotoFilters();
  const links = usePhotoEventLinks();
  const { data: stats } = usePhotoStats();
  const { items, isLoading, isFetching, error, hasNextPage, fetchNextPage, isFetchingNextPage } = usePhotoLibrary(filters);
  const { data: event } = useGetItem(filters.event, { query: { enabled: !!filters.event } });

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // A filter change can take selected photos out of view, and acting on unseen photos would surprise.
  const setParam = useCallback((key: string, value: string | undefined) => {
    if (key !== 'photo') setSelected(new Set());
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);

  const setRange = useCallback((range: { from: string; to: string } | null) => {
    setSelected(new Set());
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (range) {
        next.set('from', range.from);
        next.set('to', range.to);
      } else {
        next.delete('from');
        next.delete('to');
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  // Opening pushes a history entry and paging replaces it, so Back closes the viewer onto the grid
  // instead of leaving the page. A deep-linked photo has no grid entry behind it to pop back to.
  const openViewer = (id: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('photo', id);
      return next;
    }, { state: { viewer: true } });
  const pageViewer = (id: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('photo', id);
      return next;
    }, { replace: true, state: location.state });
  const closeViewer = () => {
    if ((location.state as { viewer?: boolean } | null)?.viewer) navigate(-1);
    else setParam('photo', undefined);
  };

  const days = useMemo(() => groupByDay(items), [items]);
  const failed = stats?.byStatus?.Failed ?? 0;

  const anchor = useRef<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [confirming, setConfirming] = useState<'purge' | 'empty' | null>(null);
  const actions = usePhotoActions();
  const showSnack = useSnackbar();
  const inTrash = filters.trashed === 'true';

  const toggle = useCallback((id: string, range: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const from = range && anchor.current ? items.findIndex((i) => i.id === anchor.current) : -1;
      const to = items.findIndex((i) => i.id === id);
      if (from >= 0 && to >= 0) {
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(items[i].id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    anchor.current = id;
  }, [items]);

  const toggleDay = (dayItems: PhotoListItemDto[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = dayItems.every((i) => next.has(i.id));
      for (const i of dayItems) {
        if (all) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });

  const selecting = selected.size > 0;
  const selectedPhotos = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);

  const report = (verb: string, outcome: { done: number; failed: number }, undo?: () => void) => {
    if (outcome.failed > 0) showSnack(outcomeMessage(verb, outcome));
    else showSnack(outcomeMessage(verb, outcome), 'success', undo && { label: 'Undo', onPress: undo });
  };

  const onTrashSelected = async () => {
    const ids = selectedPhotos.map((p) => p.id);
    setSelected(new Set());
    const outcome = await actions.trash(ids);
    report('Moved to trash:', outcome, () => void actions.restore(ids));
  };

  const onRestoreSelected = async () => {
    const ids = selectedPhotos.map((p) => p.id);
    setSelected(new Set());
    report('Restored', await actions.restore(ids));
  };

  const onUnlinkSelected = async () => {
    const ids = selectedPhotos.map((p) => p.id);
    setSelected(new Set());
    const outcome = await actions.unlink(filters.event, ids);
    report('Removed from the event:', outcome, () => void actions.link(filters.event, ids));
  };

  const onConfirmed = async () => {
    const what = confirming;
    setConfirming(null);
    if (what === 'purge') {
      const ids = selectedPhotos.map((p) => p.id);
      setSelected(new Set());
      report('Deleted for good:', await actions.purge(ids));
    } else if (what === 'empty') {
      const { failed } = await actions.emptyTrash();
      showSnack(failed > 0 ? PHOTO_TEXT.emptyTrashFailed : PHOTO_TEXT.trashEmptied, failed > 0 ? 'error' : 'success');
    }
  };

  const openPhoto = params.get('photo');
  const sentinel = useRef<HTMLDivElement>(null);
  const loadMore = useCallback(() => {
    if (!isFetchingNextPage) void fetchNextPage();
  }, [isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, loadMore]);

  const emptyText = photoEmptyText({
    ...filters, trashed: inTrash, located: filters.located === '' ? null : filters.located === 'true',
  });

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: { xs: 2, md: '16px 24px' } }}>
      {selecting ? (
        <WrapRow>
          <IconButton size="small" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <CloseIcon />
          </IconButton>
          <Typography component="h2" variant="h6" sx={{ mr: 1 }}>{selected.size} selected</Typography>
          {inTrash ? (
            <>
              <Button variant="outlined" size="small" onClick={() => void onRestoreSelected()} disabled={actions.busy}>Restore</Button>
              <Button variant="outlined" size="small" color="error" onClick={() => setConfirming('purge')} disabled={actions.busy}>
                Delete for good
              </Button>
            </>
          ) : (
            <>
              <Button variant="outlined" size="small" onClick={() => setLinking(true)}>Link to event…</Button>
              {filters.event && (
                <Button variant="outlined" size="small" onClick={() => void onUnlinkSelected()} disabled={actions.busy}>
                  Remove from event
                </Button>
              )}
              <Button variant="outlined" size="small" color="error" onClick={() => void onTrashSelected()} disabled={actions.busy}>
                Move to trash
              </Button>
            </>
          )}
        </WrapRow>
      ) : inTrash ? (
        <WrapRow>
          <Typography component="h2" variant="h6" sx={{ mr: 1 }}>Trash</Typography>
          <Button size="small" onClick={() => setParam('trashed', undefined)}>Back to photos</Button>
          {items.length > 0 && (
            <Button size="small" color="error" onClick={() => setConfirming('empty')} disabled={actions.busy}>Empty trash</Button>
          )}
          <Typography variant="caption" sx={{ color: 'text.subtle' }}>
            Each photo is deleted for good when its days run out.
          </Typography>
        </WrapRow>
      ) : (
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
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <PhotoWhenSelect stats={stats} filters={filters} onChange={setRange} />
          </Box>
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
          <PhotoSearch
            stats={stats}
            newestFirst={filters.sort !== 'TakenAtAsc'}
            onDate={setRange}
            onEvent={(id) => setParam('event', id)}
            onPlace={(label) => setParam('place', label)}
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
            <Chip label={fmtPhotoRange(filters.from, filters.to)} onDelete={() => setRange(null)} />
          )}
          {filters.place && (
            <Chip icon={<PlaceIcon />} label={filters.place} onDelete={() => setParam('place', undefined)} />
          )}
          {filters.event && (
            <Chip
              icon={<CalendarIcon />}
              label={event?.title ?? 'One event'}
              onDelete={() => setParam('event', undefined)}
            />
          )}
          {(stats?.trashedAssets ?? 0) > 0 && (
            <Chip icon={<DeleteIcon />} variant="outlined" label={`Trash · ${stats!.trashedAssets}`} onClick={() => setParam('trashed', 'true')} />
          )}
          {failed > 0 && filters.status !== 'Failed' && (
            <Chip color="warning" variant="outlined" label={`${failed} failed`} onClick={() => setParam('status', 'Failed')} />
          )}
          {isFetching && <Typography variant="caption" sx={{ color: 'text.subtle' }}>Loading…</Typography>}
        </WrapRow>
      )}

      {error && (
        <Typography component="p" sx={{ textAlign: 'center', color: 'error.main', mt: 6 }}>
          {errText(error) ?? 'Could not load photos.'}
        </Typography>
      )}

      {!error && !isLoading && items.length === 0 && (
        <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>{emptyText}</Typography>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {days.map((day) => {
            const allSelected = day.items.every((i) => selected.has(i.id));
            return (
              <Box
                key={day.key}
                component="section"
                sx={{ '&:hover [data-reveal]': { opacity: 1 } }}
              >
                <DayHeader
                  day={day}
                  links={links}
                  selecting={selecting}
                  allSelected={allSelected}
                  onToggleDay={() => toggleDay(day.items)}
                  onPlace={(label) => setParam('place', label)}
                  onEvent={(id) => setParam('event', id)}
                />
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1, mb: 2 }}>
                  {day.items.map((item) => (
                    <PhotoTile
                      key={item.id}
                      item={item}
                      eventId={links.get(item.id)?.[0]}
                      selected={selected.has(item.id)}
                      selecting={selecting}
                      onOpen={() => openViewer(item.id)}
                      onToggle={(range) => toggle(item.id, range)}
                      onShowEvent={(id) => setParam('event', id)}
                    />
                  ))}
                </Box>
              </Box>
            );
          })}

          <div ref={sentinel} />
          {hasNextPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
              <Button variant="outlined" onClick={loadMore} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : `Load ${PHOTO_PAGE_SIZE} more`}
              </Button>
            </Box>
          )}
        </Box>

        <PhotoTimelineRail stats={stats} filters={filters} onChange={setRange} />
      </Box>

      {openPhoto && (
        <PhotoViewer
          photoId={openPhoto}
          siblings={items}
          hasMore={!!hasNextPage}
          onLoadMore={loadMore}
          onClose={closeViewer}
          onNavigate={pageViewer}
        />
      )}

      {linking && (
        <LinkEventDialog photos={selectedPhotos} onClose={() => setLinking(false)} onLinked={() => setSelected(new Set())} />
      )}

      <Dialog open={confirming !== null} onClose={() => setConfirming(null)}>
        <DialogTitle>
          {confirming === 'empty' ? 'Empty the trash?' : `Delete ${photoCount(selected.size)} for good?`}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">{confirming === 'empty' ? PHOTO_TEXT.emptyTrashWarning : purgeWarning(selected.size)}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => void onConfirmed()}>Delete for good</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const OVERLAY = { position: 'absolute', px: 0.5, borderRadius: 0.5, bgcolor: SCRIM.onImage, color: SCRIM.textOnImage } as const;

function PhotoTile({ item, eventId, selected, selecting, onOpen, onToggle, onShowEvent }: {
  item: PhotoListItemDto;
  eventId: string | undefined;
  selected: boolean;
  selecting: boolean;
  onOpen: () => void;
  onToggle: (range: boolean) => void;
  onShowEvent: (eventId: string) => void;
}) {
  // Reserve the tile's shape before the image loads; an unprocessed asset has no dimensions yet.
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : '1 / 1';
  const onClick = (e: MouseEvent) => {
    if (selecting || e.shiftKey) onToggle(e.shiftKey);
    else onOpen();
  };

  return (
    <Box
      onClick={onClick}
      sx={{
        position: 'relative', cursor: 'pointer', borderRadius: 1, overflow: 'hidden',
        bgcolor: 'action.hover', '&:hover': { opacity: 0.9 }, '&:hover [data-reveal]': { opacity: 1 },
        outline: selected ? '3px solid' : 'none', outlineColor: 'primary.main', outlineOffset: -3,
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
        <Typography variant="caption" sx={{ ...OVERLAY, right: 4, bottom: 4 }}>
          {fmtDuration(item.durationSeconds)}
        </Typography>
      )}
      {item.purgesAt && (
        <Typography variant="caption" sx={{ ...OVERLAY, left: 4, bottom: 4 }}>
          {trashBadge(item.purgesAt, new Date())}
        </Typography>
      )}
      {eventId && (
        <IconButton
          size="small"
          title="Show this event's photos"
          aria-label="Show this event's photos"
          onClick={(e) => { e.stopPropagation(); onShowEvent(eventId); }}
          sx={{ ...OVERLAY, left: 4, top: 4, p: 0.25, '&:hover': { bgcolor: SCRIM.onImageHover } }}
        >
          <CalendarIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )}
      <IconButton
        size="small"
        data-reveal
        aria-label={selected ? 'Deselect' : 'Select'}
        onClick={(e) => { e.stopPropagation(); onToggle(e.shiftKey); }}
        sx={{
          ...OVERLAY, right: 4, top: 4, p: 0.25,
          opacity: selecting ? 1 : 0, '&:focus-visible': { opacity: 1 }, '@media (hover: none)': { opacity: 1 },
          '&:hover': { bgcolor: SCRIM.onImageHover },
        }}
      >
        {selected ? <CheckboxIcon sx={{ fontSize: 18 }} /> : <CheckboxBlankIcon sx={{ fontSize: 18 }} />}
      </IconButton>
    </Box>
  );
}
