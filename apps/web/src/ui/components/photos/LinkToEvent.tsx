import { useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { useGetItem } from '@lupira/cal-api/query/cal';
import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { usePhotoActions } from '../../../state/usePhotoActions';
import { usePhotoEventLinks } from '../../../state/usePhotoLibrary';
import { DrawerSection } from '../DrawerSection';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { WrapRow } from '../WrapRow';
import { LinkEventDialog } from './LinkEventDialog';

/** Events this photo belongs to, each with a way into its drawer and into its photos. */
export function LinkToEvent({ photoId, takenAt }: { photoId: string; takenAt: string }) {
  const links = usePhotoEventLinks();
  const linkedIds = links.get(photoId) ?? [];
  const [picking, setPicking] = useState(false);

  return (
    <DrawerSection title="Events">
      {linkedIds.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.subtle' }}>Not linked to an event.</Typography>
      )}
      {linkedIds.map((id) => <LinkedEvent key={id} itemId={id} photoId={photoId} />)}
      <WrapRow>
        <Button size="small" onClick={() => setPicking(true)}>Link to event…</Button>
      </WrapRow>
      {picking && <LinkEventDialog photos={[{ id: photoId, takenAt }]} onClose={() => setPicking(false)} />}
    </DrawerSection>
  );
}

function LinkedEvent({ itemId, photoId }: { itemId: string; photoId: string }) {
  const { data: item } = useGetItem(itemId);
  const actions = usePhotoActions();
  const showSnack = useSnackbar();

  const onRemove = async () => {
    const { failed } = await actions.unlink(itemId, [photoId]);
    if (failed > 0) showSnack('Could not remove the link');
    else showSnack('Removed from the event', 'success', { label: 'Undo', onPress: () => void actions.link(itemId, [photoId]) });
  };

  return (
    <WrapRow sx={{ my: 0 }}>
      <Button size="small" component={Link} to={`/items?item=${itemId}`}>{displayTitle(item?.title)}</Button>
      <Button size="small" component={Link} to={`/photos?event=${itemId}`}>All its photos</Button>
      <Button size="small" color="inherit" onClick={() => void onRemove()} disabled={actions.busy}>Remove</Button>
    </WrapRow>
  );
}
