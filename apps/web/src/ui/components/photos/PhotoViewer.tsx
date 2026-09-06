import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { Link } from 'react-router-dom';
import { fmtBytes, fmtDimensions, fmtDuration } from '@lupira/cal-domain/photoFormat';
import { fmtDateTime } from '@lupira/cal-domain/time';
import { useDeletePhoto, useGetPhoto } from '@lupira/cal-api/query/photo';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { useSnackbar } from '../SnackbarHost';
import { DrawerSection } from '../DrawerSection';
import { LinkToEvent } from './LinkToEvent';

/** Full-screen viewer. The list only carries a thumbnail — the original is presigned per asset and
 *  short-lived, so it comes from the single-asset endpoint. */
export function PhotoViewer({ photoId, siblings, onClose, onNavigate }: {
  photoId: string;
  siblings: PhotoListItemDto[];
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const { data: photo, isLoading } = useGetPhoto(photoId);
  const del = useDeletePhoto();
  const showSnack = useSnackbar();
  const [confirming, setConfirming] = useState(false);

  const index = siblings.findIndex((s) => s.id === photoId);
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;

  // HEIC originals are stored untranscoded and no browser decodes them — fall back to the WebP thumb.
  const src = useMemo(() => {
    if (!photo) return undefined;
    const heic = photo.contentType === 'image/heic' || photo.contentType === 'image/heif';
    return heic ? (photo.thumbUrl ?? undefined) : (photo.originalUrl ?? photo.thumbUrl ?? undefined);
  }, [photo]);

  const onDelete = () => {
    if (!confirming) { setConfirming(true); return; }
    del.mutate({ id: photoId }, {
      onSuccess: () => { showSnack('Photo deleted', 'success'); onClose(); },
      onError: (e) => showSnack(e instanceof Error ? e.message : 'Delete failed'),
    });
  };

  return (
    <Dialog open fullScreen onClose={onClose}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, height: '100%', bgcolor: 'background.default' }}>
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', bgcolor: '#000' }}>
          <IconButton onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', zIndex: 1 }} aria-label="Close">
            <CloseIcon />
          </IconButton>
          {prev && (
            <IconButton onClick={() => onNavigate(prev.id)} sx={{ position: 'absolute', left: 8, color: '#fff', zIndex: 1 }} aria-label="Previous">
              <ChevronLeftIcon />
            </IconButton>
          )}
          {next && (
            <IconButton onClick={() => onNavigate(next.id)} sx={{ position: 'absolute', right: 8, color: '#fff', zIndex: 1 }} aria-label="Next">
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

        <Box sx={{ width: { xs: 'auto', md: 340 }, p: 2, overflowY: 'auto' }}>
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

              <LinkToEvent photoId={photo.id} takenAt={photo.takenAt} />

              {photo.status !== 'Ready' && (
                <DrawerSection title="Status">
                  <Typography variant="body2">{photo.status}</Typography>
                  {photo.lastError && (
                    <Typography variant="caption" sx={{ color: 'warning.main' }}>{photo.lastError}</Typography>
                  )}
                </DrawerSection>
              )}

              <Box sx={{ mt: 2 }}>
                <Button color="error" size="small" onClick={onDelete} disabled={del.isPending}>
                  {confirming ? 'Tap again to delete' : 'Delete'}
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}
