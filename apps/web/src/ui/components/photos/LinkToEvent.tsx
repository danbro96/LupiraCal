import { useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { useGetItem } from '@lupira/cal-api/query/cal';
import { usePhotoEventLinks } from '../../../state/usePhotoLibrary';
import { DrawerSection } from '../DrawerSection';
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
      {linkedIds.map((id) => <LinkedEvent key={id} itemId={id} />)}
      <WrapRow>
        <Button size="small" onClick={() => setPicking(true)}>Link to event…</Button>
      </WrapRow>
      {picking && <LinkEventDialog photos={[{ id: photoId, takenAt }]} onClose={() => setPicking(false)} />}
    </DrawerSection>
  );
}

function LinkedEvent({ itemId }: { itemId: string }) {
  const { data: item } = useGetItem(itemId);
  return (
    <WrapRow sx={{ my: 0 }}>
      <Button size="small" component={Link} to={`/items?item=${itemId}`}>{item?.title ?? 'Untitled event'}</Button>
      <Button size="small" component={Link} to={`/photos?event=${itemId}`}>All its photos</Button>
    </WrapRow>
  );
}
