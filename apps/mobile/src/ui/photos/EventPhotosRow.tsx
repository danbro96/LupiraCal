import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { List, Text } from 'react-native-paper';
import { createItemRelation } from '@lupira/cal-api/fetch/cal';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import type { PhotoWindowSource } from '@danbro96/lupira-domain-photos/photoWindow';
import { PHOTO_TEXT, seeAllLinked, PHOTO_LINK } from '@danbro96/lupira-domain-photos/photoLinks';
import { toast, toastError } from '@danbro96/lupira-expo-feedback/toast';
import { useEventPhotos, useSuggestedPhotos } from '../../state/usePhotoEventLinks';
import { invalidatePhotos } from '../../sync/reactivity';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { useColors } from '../theme';
import { openSibling } from '../openSibling';
import { thumbCacheKey } from './imageCache';

const THUMB = 88;

/** The photos this event depicts, plus the ones taken while it was happening. Renders nothing when
 *  there is neither — an empty strip on every event would be noise. */
export function EventPhotosRow({ itemId, item }: { itemId: string; item: PhotoWindowSource }) {
  const c = useColors();
  const linked = useEventPhotos(itemId);
  const [suggesting, setSuggesting] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const { items: suggestions, isLoading, hasWindow } = useSuggestedPhotos(item, linked.map((p) => p.id), suggesting);

  if (!hasWindow && linked.length === 0) return null;

  const onAdd = async (photoId: string) => {
    setLinkingId(photoId);
    const r = await createItemRelation(itemId, { ...PHOTO_LINK, toRef: photoId })
      .catch(() => null);
    setLinkingId(null);
    if (r?.status === 200) {
      toast('Linked to the event');
      invalidatePhotos();
    } else {
      toastError('Could not link the photo.');
    }
  };

  return (
    <View>
      <List.Subheader>Photos</List.Subheader>
      {linked.length === 0 && !suggesting && (
        <Text style={[styles.muted, { color: c.textMuted }]}>{PHOTO_TEXT.noneLinked}</Text>
      )}
      {linked.length > 0 && (
        <Strip>
          {linked.map((photo) => (
            <Thumb
              key={photo.id}
              photo={photo}
              surface={c.surface}
              onPress={() => openSibling((links) => links.photosEventUrl(itemId, photo.id))}
            />
          ))}
        </Strip>
      )}
      {linked.length > 0 && !suggesting && (
        <Button
          title={seeAllLinked(linked.length)}
          variant="text"
          onPress={() => openSibling((links) => links.photosEventUrl(itemId))}
        />
      )}

      {suggesting ? (
        <>
          <Text style={[styles.muted, { color: c.textMuted }]}>
            {isLoading ? 'Looking…' : suggestions.length === 0 ? PHOTO_TEXT.noneAround : PHOTO_TEXT.takenDuring}
          </Text>
          <Strip>
            {suggestions.map((photo) => (
              <Thumb
                key={photo.id}
                photo={photo}
                surface={c.surface}
                dimmed={linkingId !== null}
                onPress={() => void onAdd(photo.id)}
              />
            ))}
          </Strip>
          <Button title="Done" variant="text" onPress={() => setSuggesting(false)} />
        </>
      ) : (
        hasWindow && <Button title="Add from this time…" variant="text" onPress={() => setSuggesting(true)} />
      )}
    </View>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {children}
    </ScrollView>
  );
}

function Thumb({ photo, surface, onPress, dimmed }: {
  photo: PhotoListItemDto; surface: string; onPress: () => void; dimmed?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={dimmed} style={dimmed ? styles.dimmed : undefined}>
      {photo.thumbUrl ? (
        <Image source={{ uri: photo.thumbUrl, cacheKey: thumbCacheKey(photo.id) }} style={styles.thumb} contentFit="cover" recyclingKey={photo.id} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: surface }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 6, paddingHorizontal: 16 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 4 },
  dimmed: { opacity: 0.5 },
  muted: { fontSize: 13, paddingHorizontal: 16 },
});
