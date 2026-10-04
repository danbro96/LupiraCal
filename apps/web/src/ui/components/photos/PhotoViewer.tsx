import { useEffect, useRef, useState } from 'react';
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
import { fmtDateTime } from '@danbro96/lupira-domain-core/time';
import { useGetPhoto, useReprocessPhoto } from '@lupira/cal-api/query/photo';
import { formatCoords } from '@danbro96/lupira-domain-places/places';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { fmtBytes, fmtDimensions, fmtDuration, geotagLabel, inTrashLine, originalIsViewable, purgeWarning } from '@lupira/cal-domain/photoFormat';
import { PHOTO_TEXT } from '@danbro96/lupira-domain-photos/photoLinks';
import { SCRIM } from '@danbro96/lupira-tokens-core/color';
import { useInvalidatePhotos } from '../../../state/useInvalidate';
import { usePhotoActions } from '../../../state/usePhotoActions';
import { useIsPhone } from '../../hooks/useIsPhone';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DeleteIcon, OpenInNewIcon, RestoreIcon } from '@danbro96/lupira-web-mui/icons';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { DrawerSection } from '../DrawerSection';
import { LinkToEvent } from './LinkToEvent';

// Pinned to the stage's box: a percentage max-height on a grid child doesn't resolve, so a tall
// screenshot would otherwise grow past the viewport.
const FIT = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' } as const;

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
  const actions = usePhotoActions();
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

  const src = photo
    ? (originalIsViewable(photo.contentType) ? photo.originalUrl ?? photo.thumbUrl : photo.thumbUrl) ?? undefined
    : undefined;

  const leave = () => {
    const neighbour = next ?? prev;
    if (neighbour) onNavigate(neighbour.id);
    else onClose();
  };

  const onTrash = async () => {
    leave();
    const { failed } = await actions.trash([photoId]);
    if (failed > 0) showSnack('Could not move the photo to trash');
    else showSnack(PHOTO_TEXT.movedToTrash, 'success', { label: 'Undo', onPress: () => void actions.restore([photoId]) });
  };

  const onRestore = async () => {
    leave();
    const { failed } = await actions.restore([photoId]);
    showSnack(failed > 0 ? 'Could not restore the photo' : 'Restored', failed > 0 ? 'error' : 'success');
  };

  const onPurge = async () => {
    setConfirming(false);
    leave();
    const { failed } = await actions.purge([photoId]);
    showSnack(failed > 0 ? PHOTO_TEXT.deleteFailed : PHOTO_TEXT.deletedForGood, failed > 0 ? 'error' : 'success');
  };

  const onReprocess = () =>
    reprocess.mutate({ id: photoId }, {
      onSuccess: () => { showSnack('Queued for reprocessing', 'success'); void invalidate(); },
      onError: (e) => showSnack(e instanceof Error ? e.message : 'Could not queue the photo'),
    });

  const onImage = { color: SCRIM.textOnImage, bgcolor: SCRIM.backdrop, '&:hover': { bgcolor: SCRIM.onImage } };

  return (
    <Dialog open fullScreen onClose={onClose}>
      <Box ref={rootRef} sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, height: '100%', bgcolor: 'background.default' }}>
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'grid', placeItems: 'center', bgcolor: '#000' }}>
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
            {photo?.trashedAt ? (
              <>
                <Tooltip title="Restore">
                  <IconButton onClick={() => void onRestore()} disabled={actions.busy} sx={onImage} aria-label="Restore">
                    <RestoreIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete for good">
                  <IconButton onClick={() => setConfirming(true)} disabled={actions.busy} sx={onImage} aria-label="Delete for good">
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Tooltip title="Move to trash">
                <IconButton onClick={() => void onTrash()} disabled={actions.busy || !photo} sx={onImage} aria-label="Move to trash">
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            )}
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
            <Box component="video" src={photo.originalUrl} controls sx={FIT} />
          ) : src ? (
            <Box component="img" src={src} alt="" sx={FIT} />
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
                {photo.purgesAt && (
                  <Typography variant="body2" sx={{ color: 'warning.main', mb: 1 }}>
                    {inTrashLine(photo.purgesAt, new Date())}
                  </Typography>
                )}

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
                      <Typography variant="body2">{formatCoords(photo.latitude, photo.longitude)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.subtle' }}>
                        {geotagLabel(photo.geotagSource)}
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
                    <Typography variant="body2" sx={{ color: 'text.subtle' }}>{PHOTO_TEXT.noLocation}</Typography>
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
        <DialogTitle>Delete this photo for good?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{purgeWarning(1)}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => void onPurge()}>Delete for good</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
