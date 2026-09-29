import { linkedMessage, linkPhotosTitle, unlinkedPhotoIds } from '@lupira/cal-domain/photoFormat';
import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { fmtWhen } from '@lupira/cal-domain/time';
import { usePhotoActions } from '../../../state/usePhotoActions';
import { useLinkCandidates, usePhotoEventLinks } from '../../../state/usePhotoLibrary';
import { useSnackbar } from '../SnackbarHost';

/** One picker for linking a single photo or a selection: events around the capture times, confirmed by
 *  the user — a photo taken during a 9-to-5 "work" block is not of it. */
export function LinkEventDialog({ photos, onClose, onLinked }: {
  photos: readonly { id: string; takenAt: string }[];
  onClose: () => void;
  onLinked?: () => void;
}) {
  const links = usePhotoEventLinks();
  const takenAts = photos.map((p) => p.takenAt);
  const { data: candidates, isLoading } = useLinkCandidates(takenAts, true);
  const actions = usePhotoActions();
  const showSnack = useSnackbar();
  const [busy, setBusy] = useState(false);

  const onPick = async (itemId: string) => {
    const pending = unlinkedPhotoIds(photos.map((p) => p.id), links, itemId);
    setBusy(true);
    const { done, failed } = pending.length > 0 ? await actions.link(itemId, pending) : { done: 0, failed: 0 };
    setBusy(false);
    if (failed > 0) {
      showSnack('Could not link the photos');
    } else {
      showSnack(
        linkedMessage(photos.length, done),
        'success',
        done > 0 ? { label: 'Undo', onPress: () => void actions.unlink(itemId, pending) } : undefined,
      );
      onLinked?.();
    }
    onClose();
  };

  const title = linkPhotosTitle(photos.length);

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ px: 1 }}>
        {isLoading && <Typography variant="body2" sx={{ px: 2, color: 'text.subtle' }}>Looking…</Typography>}
        {!isLoading && (candidates ?? []).length === 0 && (
          <Typography variant="body2" sx={{ px: 2, color: 'text.subtle' }}>No events around this time.</Typography>
        )}
        <List dense>
          {(candidates ?? []).map((item) => (
            <ListItemButton key={item.id} disabled={busy} onClick={() => void onPick(item.id)}>
              <ListItemText primary={item.title ?? 'Untitled event'} secondary={fmtWhen(item.start, item.isAllDay)} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
