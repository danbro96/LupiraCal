import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { useCreateItemRelation } from '@lupira/cal-api/query/cal';
import { getListRelationEdgesQueryKey } from '@lupira/cal-api/query/cal';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import type { PhotoWindowSource } from '@lupira/cal-domain/photoWindow';
import { useEventPhotos, useSuggestedPhotos } from '../../../state/usePhotoLibrary';
import { DrawerSection } from '../DrawerSection';
import { WrapRow } from '../WrapRow';
import { useSnackbar } from '../SnackbarHost';

const TILE = 72;

/** The photos an event depicts, plus the ones taken while it was happening. */
export function ItemPhotosPanel({ itemId, item }: { itemId: string; item: PhotoWindowSource }) {
  const linked = useEventPhotos(itemId);
  const [suggesting, setSuggesting] = useState(false);
  const { items: suggestions, isLoading, hasWindow } = useSuggestedPhotos(item, linked.map((p) => p.id), suggesting);
  const queryClient = useQueryClient();
  const showSnack = useSnackbar();
  const create = useCreateItemRelation();

  const onAdd = (photoId: string) =>
    create.mutate(
      { id: itemId, data: { toKind: 'photo', toRef: photoId, relationType: 'depicts' } },
      {
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListRelationEdgesQueryKey({ toKind: 'photo' }) }),
        onError: (e) => showSnack(e instanceof Error ? e.message : 'Could not link the photo'),
      },
    );

  if (!hasWindow && linked.length === 0) return null;

  return (
    <DrawerSection title="Photos">
      {linked.length === 0 && !suggesting && (
        <Typography variant="body2" sx={{ color: 'text.subtle' }}>No photos linked.</Typography>
      )}
      <WrapRow>
        {linked.map((photo) => (
          <Thumb key={photo.id} photo={photo} />
        ))}
      </WrapRow>

      {suggesting ? (
        <>
          <Typography variant="caption" sx={{ color: 'text.subtle' }}>
            {isLoading ? 'Looking…' : suggestions.length === 0 ? 'No photos from this time.' : 'Taken during this event:'}
          </Typography>
          <WrapRow>
            {suggestions.map((photo) => (
              <Thumb key={photo.id} photo={photo} onAdd={() => onAdd(photo.id)} />
            ))}
          </WrapRow>
          <Button size="small" onClick={() => setSuggesting(false)}>Done</Button>
        </>
      ) : (
        hasWindow && <Button size="small" onClick={() => setSuggesting(true)}>Add from this time…</Button>
      )}
    </DrawerSection>
  );
}

function Thumb({ photo, onAdd }: { photo: PhotoListItemDto; onAdd?: () => void }) {
  const image = (
    <Box
      component="img"
      src={photo.thumbUrl ?? undefined}
      alt=""
      loading="lazy"
      sx={{ width: TILE, height: TILE, objectFit: 'cover', borderRadius: 1, display: 'block', bgcolor: 'action.hover' }}
    />
  );

  if (!onAdd) return <Link to={`/photos?photo=${photo.id}`}>{image}</Link>;
  return (
    <Box
      component="button"
      type="button"
      onClick={onAdd}
      title="Link to this event"
      sx={{ p: 0, border: 0, background: 'none', cursor: 'pointer', lineHeight: 0 }}
    >
      {image}
    </Box>
  );
}
