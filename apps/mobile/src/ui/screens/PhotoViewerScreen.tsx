import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fmtDateTime } from '@lupira/cal-domain/time';
import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Button, IconButton, List, Menu, Text } from 'react-native-paper';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { reprocessPhoto } from '@lupira/cal-api/fetch/photo';
import { formatCoords } from '@lupira/cal-domain/places';
import { fmtBytes, fmtDimensions, fmtDuration, geotagLabel, inTrashLine, originalIsViewable, PHOTO_TEXT, purgeWarning } from '@lupira/cal-domain/photoFormat';
import { toast, toastError } from '../../feedback/toast';
import { purgePhotos, restorePhotos, trashPhotos } from '../../state/photoActions';
import { DEFAULT_PHOTO_FILTERS, usePhoto, usePhotoLibrary } from '../../state/usePhotoLibrary';
import { saveOriginalToPhone } from '../../sync/photoUploader';
import { invalidatePhotos } from '../../sync/reactivity';
import { Centered } from '../components/Centered';
import { useConfirm } from '../components/ConfirmDialog';
import { LinkEventSheet } from '../photos/LinkEventSheet';
import { originalCacheKey, thumbCacheKey } from '../photos/imageCache';
import { PhotoEventLinks } from '../photos/PhotoEventLinks';
import { useColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { ICONS } from '../icons';

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
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: detail, isLoading } = usePhoto(currentId);

  // The photo is only swipeable if it is actually in the loaded page — from a deep link, or after a
  // cache eviction, the single-asset fetch is the whole list. Tracking the id rather than the index
  // keeps that decision correct when the page arrives mid-render.
  const found = items.findIndex((i) => i.id === currentId);
  const inPage = found >= 0;
  const pages = useMemo<PhotoListItemDto[]>(() => (inPage ? items : detail ? [detail] : []), [inPage, items, detail]);
  const index = Math.max(0, found);
  const current = detail ?? pages[index] ?? pages[0];

  const onTrash = async () => {
    setMenuOpen(false);
    const id = currentId;
    setBusy(true);
    const { failed } = await trashPhotos([id]);
    setBusy(false);
    if (failed > 0) {
      toastError('Could not move the photo to trash.');
      return;
    }
    toast(PHOTO_TEXT.movedToTrash, { action: { label: 'Undo', onPress: () => void restorePhotos([id]) } });
    navigation.goBack();
  };

  const onRestore = async () => {
    setBusy(true);
    const { failed } = await restorePhotos([currentId]);
    setBusy(false);
    if (failed > 0) {
      toastError('Could not restore the photo.');
      return;
    }
    toast('Restored');
    navigation.goBack();
  };

  const onPurge = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: 'Delete for good',
      message: purgeWarning(1),
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const { failed } = await purgePhotos([currentId]);
    setBusy(false);
    if (failed > 0) {
      toastError(PHOTO_TEXT.deleteFailed);
      return;
    }
    toast(PHOTO_TEXT.deletedForGood);
    navigation.goBack();
  };

  const onReprocess = async () => {
    setMenuOpen(false);
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

  const onSave = async () => {
    if (!detail?.originalUrl) return;
    setBusy(true);
    const saved = await saveOriginalToPhone({ ...detail, originalUrl: detail.originalUrl }).catch(() => null);
    setBusy(false);
    if (saved) toast('Saved to this phone');
    else toastError(saved === false ? 'Saving needs access to your photos.' : 'Could not save the photo.');
  };

  useLayoutEffect(() => {
    navigation.setOptions({ title: pages.length > 1 ? `${index + 1} of ${pages.length}` : 'Photo' });
  }, [navigation, index, pages.length]);

  // Stable list props: a new renderItem re-renders every mounted page, and each page owns gestures.
  const originalUrl = detail?.originalUrl;
  const renderItem = useCallback(({ item, index: i }: { item: PhotoListItemDto; index: number }) => (
    <PhotoPage
      photo={item}
      width={width}
      active={i === index}
      // The original is presigned per asset with a short expiry, so it is fetched only for the
      // page in view; neighbours show their thumbnail until swiped to.
      originalUrl={i === index ? originalUrl : undefined}
      onZoomChange={setZoomed}
      onSwipeInfo={setInfoOpen}
    />
  ), [width, index, originalUrl]);
  const getItemLayout = useCallback(
    (_: unknown, i: number) => ({ length: width, offset: width * i, index: i }),
    [width],
  );
  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pages[Math.round(e.nativeEvent.contentOffset.x / width)];
    if (next) setCurrentId(next.id);
  }, [pages, width]);
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (pages.length === 0) return <Centered text={isLoading ? 'Loading…' : 'This photo is no longer available.'} />;

  const located = current.latitude != null && current.longitude != null;

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <FlatList
        // initialScrollIndex is read once, so switching out of single-photo mode has to remount.
        key={found >= 0 ? 'page' : 'single'}
        data={pages}
        horizontal
        pagingEnabled
        // A zoomed photo pans under the finger; paging would steal the drag.
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        keyExtractor={photoKey}
        initialScrollIndex={index}
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onEndReached={onEndReached}
        onEndReachedThreshold={1}
        renderItem={renderItem}
        // Full-screen pages: one on each side is enough, the default window holds ~21 of them.
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
      />

      {infoOpen && (
        <ScrollView style={[styles.meta, { borderTopColor: c.divider }]} contentContainerStyle={styles.metaContent}>
          <Metadata photo={current} onReprocess={() => void onReprocess()} busy={busy} />
        </ScrollView>
      )}

      <View style={[styles.actions, { borderTopColor: c.divider, backgroundColor: c.bg }]}>
        <IconButton
          icon={ICONS.info}
          selected={infoOpen}
          onPress={() => setInfoOpen((v) => !v)}
          accessibilityLabel={infoOpen ? 'Hide info' : 'Info'}
        />
        <IconButton
          icon={ICONS.download}
          disabled={busy || !detail?.originalUrl}
          onPress={() => void onSave()}
          accessibilityLabel="Save to this phone"
        />
        <IconButton
          icon={ICONS.map}
          disabled={!located}
          onPress={() => navigation.navigate('Tabs', {
            screen: 'Map',
            params: { at: { lon: current.longitude!, lat: current.latitude!, focus: 'photo' } },
          })}
          accessibilityLabel="Show on the map"
        />
        {current.trashedAt ? (
          <IconButton icon={ICONS.restore} disabled={busy} onPress={() => void onRestore()} accessibilityLabel="Restore" />
        ) : (
          <IconButton icon={ICONS.link} onPress={() => setLinking(true)} accessibilityLabel="Link to event" />
        )}
        <Menu
          visible={menuOpen}
          onDismiss={() => setMenuOpen(false)}
          anchor={<IconButton icon={ICONS.more} onPress={() => setMenuOpen(true)} accessibilityLabel="More" />}
        >
          {current.status === 'Failed' && (
            <Menu.Item leadingIcon={ICONS.schedule} title="Retry processing" disabled={busy} onPress={() => void onReprocess()} />
          )}
          {current.trashedAt ? (
            <Menu.Item leadingIcon={ICONS.deleteForever} title="Delete for good" titleStyle={{ color: c.danger }} disabled={busy} onPress={() => void onPurge()} />
          ) : (
            <Menu.Item leadingIcon={ICONS.delete} title="Move to trash" disabled={busy} onPress={() => void onTrash()} />
          )}
        </Menu>
      </View>

      {linking && (
        <LinkEventSheet photos={[{ id: current.id, takenAt: current.takenAt }]} onDismiss={() => setLinking(false)} />
      )}
    </View>
  );
}

const photoKey = (item: PhotoListItemDto) => item.id;

const PhotoPage = memo(function PhotoPage({ photo, width, active, originalUrl, onZoomChange, onSwipeInfo }: {
  photo: PhotoListItemDto;
  width: number;
  active: boolean;
  originalUrl?: string | null;
  onZoomChange: (zoomed: boolean) => void;
  onSwipeInfo: (open: boolean) => void;
}) {
  const c = useColors();
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const height = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  // A neighbour swiped away keeps its zoom otherwise, and comes back magnified.
  useEffect(() => {
    if (active) return;
    scale.value = 1;
    saved.value = 1;
    x.value = 0;
    y.value = 0;
    savedX.value = 0;
    savedY.value = 0;
    setZoomed(false);
  }, [active, scale, saved, x, y, savedX, savedY]);

  // Memoized: a fresh gesture makes GestureDetector re-attach its native handlers every render.
  const gesture = useMemo(() => {
    const report = (next: boolean) => {
      setZoomed(next);
      onZoomChange(next);
    };
    const clampX = (v: number) => {
      'worklet';
      const max = (width * (scale.value - 1)) / 2;
      return Math.min(Math.max(v, -max), max);
    };
    const clampY = (v: number) => {
      'worklet';
      const max = (height.value * (scale.value - 1)) / 2;
      return Math.min(Math.max(v, -max), max);
    };
    const settle = (next: number) => {
      'worklet';
      saved.value = next;
      if (next <= 1) {
        x.value = withTiming(0);
        y.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      } else {
        x.value = clampX(x.value);
        y.value = clampY(y.value);
        savedX.value = x.value;
        savedY.value = y.value;
      }
      scheduleOnRN(report, next > 1);
    };

    const pinch = Gesture.Pinch()
      .onUpdate((e) => { scale.value = Math.min(Math.max(saved.value * e.scale, 1), MAX_SCALE); })
      .onEnd(() => settle(scale.value));
    const pan = Gesture.Pan()
      .enabled(zoomed)
      .averageTouches(true)
      .onUpdate((e) => {
        x.value = clampX(savedX.value + e.translationX);
        y.value = clampY(savedY.value + e.translationY);
      })
      .onEnd(() => {
        savedX.value = x.value;
        savedY.value = y.value;
      });
    const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
      const next = scale.value > 1 ? 1 : 2;
      scale.value = withTiming(next);
      settle(next);
    });
    const swipeUp = Gesture.Fling().direction(Directions.UP).enabled(!zoomed)
      .onEnd((_e, success) => { if (success) scheduleOnRN(onSwipeInfo, true); });
    const swipeDown = Gesture.Fling().direction(Directions.DOWN).enabled(!zoomed)
      .onEnd((_e, success) => { if (success) scheduleOnRN(onSwipeInfo, false); });
    return Gesture.Simultaneous(pinch, pan, doubleTap, swipeUp, swipeDown);
  }, [scale, saved, x, y, savedX, savedY, height, width, zoomed, onZoomChange, onSwipeInfo]);

  const zoom = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  const original = originalIsViewable(photo.contentType) && originalUrl ? originalUrl : null;
  const uri = original ?? photo.thumbUrl;
  const cacheKey = original ? originalCacheKey(photo.id) : thumbCacheKey(photo.id);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.page, { width }]} onLayout={(e) => { height.value = e.nativeEvent.layout.height; }}>
        {uri ? (
          <Animated.View style={[styles.fill, zoom]}>
            <Image source={{ uri, cacheKey }} style={styles.fill} contentFit="contain" transition={150} recyclingKey={photo.id} />
          </Animated.View>
        ) : (
          <Text style={{ color: c.textMuted }}>
            {photo.status === 'Failed' ? 'This upload failed to process.' : 'Still processing…'}
          </Text>
        )}
      </View>
    </GestureDetector>
  );
});

function Metadata({ photo, onReprocess, busy }: { photo: PhotoListItemDto; onReprocess: () => void; busy: boolean }) {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const dims = fmtDimensions(photo.width, photo.height);

  return (
    <>
      <Text style={[styles.title, { color: c.text }]}>{photo.placeLabel ?? 'Unknown place'}</Text>
      <Text style={[styles.detail, { color: c.textMuted }]}>{fmtDateTime(new Date(photo.takenAt))}</Text>
      {photo.purgesAt && (
        <Text style={[styles.detail, { color: c.warning }]}>
          {inTrashLine(photo.purgesAt, new Date())}
        </Text>
      )}

      <List.Subheader>File</List.Subheader>
      <Text style={[styles.detail, { color: c.textMuted }]}>
        {[photo.contentType, fmtBytes(photo.sizeBytes), dims,
          photo.durationSeconds != null ? fmtDuration(photo.durationSeconds) : null]
          .filter(Boolean).join(' · ')}
      </Text>

      <List.Subheader>Location</List.Subheader>
      <Text style={[styles.detail, { color: c.textMuted }]}>
        {photo.latitude != null && photo.longitude != null
          ? `${formatCoords(photo.latitude, photo.longitude)} · ${geotagLabel(photo.geotagSource)}`
          : PHOTO_TEXT.noLocation}
      </Text>

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
          {photo.status === 'Failed' && (
            <Button mode="text" compact disabled={busy} onPress={onReprocess}>Retry processing</Button>
          )}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  fill: { width: '100%', height: '100%' },
  meta: { maxHeight: '40%', borderTopWidth: StyleSheet.hairlineWidth },
  metaContent: { padding: 16, paddingTop: 8, gap: 2 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13 },
});
