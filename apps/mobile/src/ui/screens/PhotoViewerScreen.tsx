import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fmtBytes, fmtDimensions, fmtDuration } from '@lupira/cal-domain/photoFormat';
import { Image } from 'expo-image';
import { useLayoutEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Button, List, Text } from 'react-native-paper';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { deletePhoto, reprocessPhoto } from '@lupira/cal-api/fetch/photo';
import { toast, toastError } from '../../feedback/toast';
import { DEFAULT_PHOTO_FILTERS, usePhoto, usePhotoLibrary } from '../../state/usePhotoLibrary';
import { invalidatePhotos } from '../../sync/reactivity';
import { Centered } from '../components/Centered';
import { useConfirm } from '../components/ConfirmDialog';
import { PhotoEventLinks } from '../photos/PhotoEventLinks';
import { useColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

const MAX_SCALE = 4;

/** Full-screen viewer, swiping across the same page the grid already loaded — the route carries the
 *  grid's filters so `usePhotoLibrary` hits the cache instead of refetching. Only the current photo is
 *  fetched singly, for its short-lived `originalUrl`. */
export function PhotoViewerScreen() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const route = useRoute<RouteProp<RootStackParamList, 'PhotoViewer'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const confirm = useConfirm();
  const { photoId, filters } = route.params;

  const { items, hasNextPage, fetchNextPage, isFetchingNextPage } = usePhotoLibrary(filters ?? DEFAULT_PHOTO_FILTERS);
  const [currentId, setCurrentId] = useState(photoId);
  const [infoOpen, setInfoOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: detail, isLoading } = usePhoto(currentId);

  // The photo is only swipeable if it is actually in the loaded page — from a deep link, or after a
  // cache eviction, the single-asset fetch is the whole list. Tracking the id rather than the index
  // keeps that decision correct when the page arrives mid-render.
  const found = items.findIndex((i) => i.id === currentId);
  const pages: PhotoListItemDto[] = found >= 0 ? items : detail ? [detail] : [];
  const index = Math.max(0, found);

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete photo',
      message: 'This removes the original and its thumbnail from storage. It cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await deletePhoto(currentId).catch(() => null);
    setBusy(false);
    if (r?.status === 204) {
      toast('Photo deleted');
      invalidatePhotos();
      navigation.goBack();
    } else {
      toastError('Could not delete the photo.');
    }
  };

  const onReprocess = async () => {
    setBusy(true);
    const r = await reprocessPhoto(currentId).catch(() => null);
    setBusy(false);
    if (r?.status === 200) {
      toast('Queued for reprocessing');
      invalidatePhotos();
    } else {
      toastError('Could not queue the photo.');
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: pages.length > 1 ? `${index + 1} of ${pages.length}` : 'Photo',
      headerRight: () => (
        <View style={styles.headerActions}>
          <Button mode="text" compact onPress={() => setInfoOpen((v) => !v)}>{infoOpen ? 'Hide' : 'Info'}</Button>
          <Button mode="text" compact textColor={c.danger} disabled={busy} onPress={() => void onDelete()}>
            Delete
          </Button>
        </View>
      ),
    });
    // onDelete closes over the current id, so the header must re-register when the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, c.danger, busy, infoOpen, index, pages.length, currentId]);

  if (pages.length === 0) return <Centered text={isLoading ? 'Loading…' : 'This photo is no longer available.'} />;

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <FlatList
        // initialScrollIndex is read once, so switching out of single-photo mode has to remount.
        key={found >= 0 ? 'page' : 'single'}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => {
          const next = pages[Math.round(e.nativeEvent.contentOffset.x / width)];
          if (next) setCurrentId(next.id);
        }}
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) void fetchNextPage(); }}
        onEndReachedThreshold={1}
        renderItem={({ item, index: i }) => (
          <PhotoPage
            photo={item}
            width={width}
            // The original is presigned per asset with a short expiry, so it is fetched only for the
            // page in view; neighbours show their thumbnail until swiped to.
            originalUrl={i === index ? detail?.originalUrl : undefined}
          />
        )}
      />

      {infoOpen && (
        <ScrollView style={[styles.meta, { borderTopColor: c.divider }]} contentContainerStyle={styles.metaContent}>
          <Metadata photo={detail ?? pages[index] ?? pages[0]} onReprocess={() => void onReprocess()} busy={busy} />
        </ScrollView>
      )}
    </View>
  );
}

function PhotoPage({ photo, width, originalUrl }: { photo: PhotoListItemDto; width: number; originalUrl?: string | null }) {
  const c = useColors();
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.min(Math.max(saved.value * e.scale, 1), MAX_SCALE); })
    .onEnd(() => { saved.value = scale.value; });

  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    const next = scale.value > 1 ? 1 : 2;
    scale.value = withTiming(next);
    saved.value = next;
  });

  const zoom = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // HEIC originals are stored untranscoded and the decoder can't read them — the WebP thumbnail is the
  // only viewable rendition.
  const heic = photo.contentType === 'image/heic' || photo.contentType === 'image/heif';
  const uri = heic ? photo.thumbUrl : (originalUrl ?? photo.thumbUrl);

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, doubleTap)}>
      <View style={[styles.page, { width }]}>
        {uri ? (
          <Animated.View style={[styles.fill, zoom]}>
            <Image source={{ uri }} style={styles.fill} contentFit="contain" transition={150} recyclingKey={photo.id} />
          </Animated.View>
        ) : (
          <Text style={{ color: c.textMuted }}>
            {photo.status === 'Failed' ? 'This upload failed to process.' : 'Still processing…'}
          </Text>
        )}
      </View>
    </GestureDetector>
  );
}

function Metadata({ photo, onReprocess, busy }: { photo: PhotoListItemDto; onReprocess: () => void; busy: boolean }) {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dims = fmtDimensions(photo.width, photo.height);

  return (
    <>
      <Text style={[styles.title, { color: c.text }]}>{photo.placeLabel ?? 'Unknown place'}</Text>
      <Text style={[styles.detail, { color: c.textMuted }]}>{new Date(photo.takenAt).toLocaleString()}</Text>

      <List.Subheader>File</List.Subheader>
      <Text style={[styles.detail, { color: c.textMuted }]}>
        {[photo.contentType, fmtBytes(photo.sizeBytes), dims,
          photo.durationSeconds != null ? fmtDuration(photo.durationSeconds) : null]
          .filter(Boolean).join(' · ')}
      </Text>

      <List.Subheader>Location</List.Subheader>
      <Text style={[styles.detail, { color: c.textMuted }]}>
        {photo.latitude != null && photo.longitude != null
          ? `${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)} · ${photo.geotagSource === 'ExifGps' ? 'from the camera' : 'matched from your location history'}`
          : 'No location — this photo never appears on the map.'}
      </Text>
      {photo.latitude != null && photo.longitude != null && (
        <Button
          mode="text"
          compact
          onPress={() => navigation.navigate('Tabs', {
            screen: 'Map',
            params: { at: { lon: photo.longitude!, lat: photo.latitude! } },
          })}
        >
          Show on the map
        </Button>
      )}

      {photo.duplicateOfId != null && (
        <>
          <List.Subheader>Duplicate</List.Subheader>
          <Text style={[styles.detail, { color: c.textMuted }]}>
            The same photo is already in your library; this copy holds no bytes.
          </Text>
          <Button mode="text" compact onPress={() => navigation.push('PhotoViewer', { photoId: photo.duplicateOfId! })}>
            Open the original
          </Button>
        </>
      )}

      <List.Subheader>Events</List.Subheader>
      <PhotoEventLinks photoId={photo.id} takenAt={photo.takenAt} />

      {photo.status !== 'Ready' && (
        <>
          <List.Subheader>Status</List.Subheader>
          <Text style={[styles.detail, { color: photo.lastError ? c.danger : c.textMuted }]}>
            {photo.lastError ?? photo.status}
          </Text>
          <Button mode="text" compact disabled={busy} onPress={onReprocess}>Retry processing</Button>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  fill: { width: '100%', height: '100%' },
  meta: { maxHeight: '40%', borderTopWidth: StyleSheet.hairlineWidth },
  metaContent: { padding: 16, paddingTop: 8, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13 },
});
