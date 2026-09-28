import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { fmtBytes, fmtDimensions, fmtDuration } from '@lupira/cal-domain/photoFormat';
import { fmtDateTime } from '@lupira/cal-domain/time';
import { useDeletePhoto, useGetPhoto, useReprocessPhoto } from '@lupira/cal-api/query/photo';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { useInvalidatePhotos } from '../../../state/useInvalidate';
import { useIsPhone } from '../../hooks/useIsPhone';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DeleteIcon, OpenInNewIcon } from '../../icons';
import { useSnackbar } from '../SnackbarHost';
import { DrawerSection } from '../DrawerSection';
import { LinkToEvent } from './LinkToEvent';

/** Paging ahead this close to the end keeps "next" from vanishing at a page boundary. */
const PREFETCH_WITHIN = 3;

/** Full-screen viewer. The list only carries a thumbnail — the original is presigned per asset and
 *  short-lived, so it comes from the single-asset endpoint. */
export function PhotoViewer({ photoId, siblings, hasMore, onLoadMore, onClose, onNavigate }: {
  photoId: string;
  siblings: PhotoListItemDto[];
  hasMore: boolean;
  onLoadMore: () => void;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const { data: photo, isLoading } = useGetPhoto(photoId);
  const del = useDeletePhoto();
  const reprocess = useReprocessPhoto();
  const invalidate = useInvalidatePhotos();
  const showSnack = useSnackbar();
  const isPhone = useIsPhone();
  const [infoOpen, setInfoOpen] = useState(!isPhone);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const index = siblings.findIndex((s) => s.id === photoId);
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;

  useEffect(() => {
    if (hasMore && index >= 0 && index >= siblings.length - PREFETCH_WITHIN) onLoadMore();
  }, [hasMore, index, siblings.length, onLoadMore]);

  useEffect(() => {
    if (confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (e.target.closest('input, textarea, [role="listbox"]')) return;
      // A dialog opened over the viewer (the event picker) owns its own keys.
      const dialog = e.target.closest('[role="dialog"]');
      if (dialog && dialog !== rootRef.current?.closest('[role="dialog"]')) return;
      if (e.key === 'ArrowLeft' && prev) onNavigate(prev.id);
      if (e.key === 'ArrowRight' && next) onNavigate(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, prev, next, onNavigate]);

  // HEIC originals are stored untranscoded and no browser decodes them — fall back to the WebP thumb.
  const src = useMemo(() => {
    if (!photo) return undefined;
    const heic = photo.contentType === 'image/heic' || photo.contentType === 'image/heif';
    return heic ? (photo.thumbUrl ?? undefined) : (photo.originalUrl ?? photo.thumbUrl ?? undefined);
  }, [photo]);

  const onDelete = () => {
    setConfirming(false);
    del.mutate({ id: photoId }, {
      onSuccess: () => {
        showSnack('Photo deleted', 'success');
        void invalidate();
        if (next ?? prev) onNavigate((next ?? prev)!.id);
        else onClose();
      },
      onError: (e) => showSnack(e instanceof Error ? e.message : 'Delete failed'),
    });
  };

  const onReprocess = () =>
    reprocess.mutate({ id: photoId }, {
      onSuccess: () => { showSnack('Queued for reprocessing', 'success'); void invalidate(); },
      onError: (e) => showSnack(e instanceof Error ? e.message : 'Could not queue the photo'),
    });

  const onImage = { color: '#fff', bgcolor: 'rgba(0,0,0,0.4)', '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' } };

  return (
    <Dialog open fullScreen onClose={onClose}>
      <Box ref={rootRef} sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, height: '100%', bgcolor: 'background.default' }}>
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', bgcolor: '#000' }}>
          <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button size="small" onClick={() => setInfoOpen((v) => !v)} sx={onImage}>
              {infoOpen ? 'Hide info' : 'Info'}
            </Button>
            {photo?.originalUrl && (
              <Tooltip title="Open the original">
                <IconButton component="a" href={photo.originalUrl} target="_blank" rel="noopener" sx={onImage} aria-label="Open the original">
                  <OpenInNewIcon />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Delete">
              <IconButton onClick={() => setConfirming(true)} disabled={del.isPending} sx={onImage} aria-label="Delete">
                <DeleteIcon />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onClose} sx={onImage} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Box>
          {prev && (
            <IconButton onClick={() => onNavigate(prev.id)} sx={{ ...onImage, position: 'absolute', left: 8, zIndex: 1 }} aria-label="Previous">
              <ChevronLeftIcon />
            </IconButton>
          )}
          {next && (
            <IconButton onClick={() => onNavigate(next.id)} sx={{ ...onImage, position: 'absolute', right: 8, zIndex: 1 }} aria-label="Next">
              <ChevronRightIcon />
            </IconButton>
          )}
          {photo?.kind === 'Video' && photo.originalUrl ? (
            <Box component="video" src={photo.originalUrl} controls sx={{ maxWidth: '100%', maxHeight: '100%' }} />
          ) : src ? (
            <Box component="img" src={src} alt="" sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            <Typography sx={{ color: '#fff' }}>{isLoading ? 'Loading…' : 'No preview available'}</Typography>
          )}
        </Box>

        {infoOpen && (
          <Box sx={{ width: { xs: 'auto', md: 340 }, maxHeight: { xs: '45%', md: 'none' }, p: 2, overflowY: 'auto' }}>
            {photo && (
              <>
                <Typography variant="h6">{photo.placeLabel ?? 'Unknown place'}</Typography>
                <Typography variant="body2" sx={{ color: 'text.subtle', mb: 1 }}>
                  {fmtDateTime(new Date(photo.takenAt))}
                </Typography>

                <DrawerSection title="File">
                  <Typography variant="body2">{photo.contentType} · {fmtBytes(photo.sizeBytes)}</Typography>
                  {fmtDimensions(photo.width, photo.height) && (
                    <Typography variant="body2">{fmtDimensions(photo.width, photo.height)}</Typography>
                  )}
                  {photo.durationSeconds != null && (
                    <Typography variant="body2">{fmtDuration(photo.durationSeconds)}</Typography>
                  )}
                </DrawerSection>

                <DrawerSection title="Place">
                  {photo.latitude != null ? (
                    <>
                      <Typography variant="body2">{photo.latitude.toFixed(5)}, {photo.longitude!.toFixed(5)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.subtle' }}>
                        {photo.geotagSource === 'ExifGps' ? 'From the camera' : 'Matched from your location history'}
                      </Typography>
                      <Box>
                        <Button
                          size="small"
                          component={Link}
                          to={`/locations?at=${photo.longitude!},${photo.latitude}&layers=photos`}
                        >
                          Show on the map
                        </Button>
                      </Box>
                    </>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.subtle' }}>No location — this photo never appears on the map.</Typography>
                  )}
                </DrawerSection>

                {photo.duplicateOfId != null && (
                  <DrawerSection title="Duplicate">
                    <Typography variant="body2" sx={{ color: 'text.subtle' }}>
                      The same photo is already in your library; this copy holds no bytes.
                    </Typography>
                    <Box>
                      <Button size="small" onClick={() => onNavigate(photo.duplicateOfId!)}>Open the original</Button>
                    </Box>
                  </DrawerSection>
                )}

                <LinkToEvent key={photo.id} photoId={photo.id} takenAt={photo.takenAt} />

                {photo.status !== 'Ready' && (
                  <DrawerSection title="Status">
                    <Typography variant="body2">{photo.status}</Typography>
                    {photo.lastError && (
                      <Typography variant="caption" sx={{ color: 'warning.main' }}>{photo.lastError}</Typography>
                    )}
                    {photo.status === 'Failed' && (
                      <Box>
                        <Button size="small" onClick={onReprocess} disabled={reprocess.isPending}>Retry processing</Button>
                      </Box>
                    )}
                  </DrawerSection>
                )}
              </>
            )}
          </Box>
        )}
      </Box>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Delete this photo?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This removes the original and its thumbnail from storage. It cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={onDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
