import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Icon, IconButton, Text } from 'react-native-paper';
import {
  fmtDuration, outcomeMessage, PHOTO_TEXT, photoCount, purgeWarning, trashBadge,
} from '@lupira/cal-domain/photoFormat';
import { fmtPhotoRange, photoTimeline, yearRange } from '@lupira/cal-domain/photoTimeline';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { photoEmptyText } from '@lupira/cal-domain/photoFilter';
import { SCRIM } from '@lupira/cal-tokens/color';
import { photoGrid, type PhotoGridEntry } from '../../domain/photoGrid';
import { hapticSelection } from '../../feedback/haptics';
import { toast, toastError } from '../../feedback/toast';
import { usePhotoBackup } from '../../state/photo-backup-store';
import { emptyTrash, purgePhotos, restorePhotos, trashPhotos, type Outcome } from '../../state/photoActions';
import { linkPhotosToEvent, unlinkPhotosFromEvent, useLinkedEvents, usePhotoEventLinks } from '../../state/usePhotoEventLinks';
import { DEFAULT_PHOTO_FILTERS, groupByDay, usePhotoLibrary, usePhotoStats, type PhotoDay, type PhotoQueryFilters } from '../../state/usePhotoLibrary';
import { usePhotoBackupStatus } from '../../sync/photoBackupStatus';
import { retryParkedPhotos } from '../../sync/photoUploader';
import { Centered } from '../components/Centered';
import { useConfirm } from '../components/ConfirmDialog';
import { IndeterminateBar } from '../components/IndeterminateBar';
import { LetterRail } from '../components/LetterRail';
import { ScreenToolbar } from '../components/ScreenToolbar';
import { SyncBanner } from '../components/SyncBanner';
import { useColors } from '../theme';
import { DayHeader } from '../photos/DayHeader';
import { LinkEventSheet } from '../photos/LinkEventSheet';
import { PhotoFiltersSheet } from '../photos/PhotoFiltersSheet';
import { PhotoSearchSheet } from '../photos/PhotoSearchSheet';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { ICONS } from '../icons';
import { thumbCacheKey } from '../photos/imageCache';

const COLUMNS = 3;
const GAP = 2;
const NO_SELECTION: ReadonlySet<string> = new Set();

type Entry = PhotoGridEntry<PhotoListItemDto>;

const entryKey = (e: Entry) => (e.kind === 'header' ? e.day.key : e.key);
const entryType = (e: Entry) => e.kind;
const yearLabel = (year: string) => `’${year.slice(2)}`;

/** The whole library — including photos with no location, which the map can never show. */
export function PhotosScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNavigation = useNavigation<BottomTabNavigationProp<TabParamList, 'Photos'>>();
  const route = useRoute<RouteProp<TabParamList, 'Photos'>>();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<PhotoQueryFilters>(DEFAULT_PHOTO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [linking, setLinking] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  // A filter change can take selected photos out of view, and acting on unseen photos would surprise.
  const applyFilters = (next: PhotoQueryFilters | ((f: PhotoQueryFilters) => PhotoQueryFilters)) => {
    setSelected(NO_SELECTION);
    setFilters(next);
  };

  // Handoffs (a map pin's day, an event's photos) are consumed and cleared, so the same one arriving
  // twice still applies after the user has changed the filters in between.
  const { from, to, event } = route.params ?? {};
  const [appliedParams, setAppliedParams] = useState(route.params);
  if (route.params !== appliedParams) {
    setAppliedParams(route.params);
    if (event) applyFilters((f) => ({ sort: f.sort, event }));
    else if (from) applyFilters((f) => ({ ...f, from, to: to ?? from, event: undefined }));
  }
  useEffect(() => {
    if (!from && !event) return;
    tabNavigation.setParams({ from: undefined, to: undefined, event: undefined });
  }, [from, to, event, tabNavigation]);

  const { items, offline, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage, refetch, isRefetching } =
    usePhotoLibrary(filters);
  const links = usePhotoEventLinks();
  const { data: stats } = usePhotoStats();
  const [eventTitle] = useLinkedEvents(filters.event ? [filters.event] : []).map((e) => e.title);

  const { entries, headerIndices } = photoGrid(groupByDay(items), COLUMNS);
  const tile = (gridWidth - GAP * (COLUMNS + 1)) / COLUMNS;
  const failed = stats?.byStatus?.Failed ?? 0;
  const timeline = photoTimeline(stats?.byMonth ?? {}, filters.sort !== 'TakenAtAsc');
  const railLabels = timeline.map((y) => yearLabel(y.year));
  const railPresent = new Set(railLabels);
  const onRailSelect = (label: string) => {
    const year = timeline.find((y) => yearLabel(y.year) === label)?.year;
    if (year) applyFilters((f) => ({ ...f, ...yearRange(year) }));
  };

  const filterSummary = [
    filters.trashed ? 'Trash' : null,
    filters.sort === 'TakenAtAsc' ? 'Oldest first' : null,
    filters.event ? (eventTitle ?? 'One event') : null,
    filters.kind,
    filters.located === true ? 'Has a place' : filters.located === false ? 'No location' : null,
    filters.place ? `“${filters.place}”` : null,
    filters.status,
    filters.from ? fmtPhotoRange(filters.from, filters.to) : null,
  ].filter(Boolean).join(' · ');

  const selecting = selected.size > 0;
  const toggle = (photoId: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(photoId)) next.delete(photoId);
    else next.add(photoId);
    return next;
  });
  const toggleDay = (day: PhotoDay) => setSelected((prev) => {
    const next = new Set(prev);
    const all = day.items.every((p) => next.has(p.id));
    for (const p of day.items) {
      if (all) next.delete(p.id);
      else next.add(p.id);
    }
    return next;
  });
  const selectedPhotos = items.filter((p) => selected.has(p.id));

  const report = (verb: string, outcome: Outcome, undo?: () => void) => {
    if (outcome.failed > 0) toastError(outcomeMessage(verb, outcome));
    else toast(outcomeMessage(verb, outcome), undo ? { action: { label: 'Undo', onPress: undo } } : undefined);
  };
  const takeSelection = () => {
    const ids = selectedPhotos.map((p) => p.id);
    setSelected(NO_SELECTION);
    return ids;
  };

  const onTrashSelected = async () => {
    const ids = takeSelection();
    report('Moved to trash:', await trashPhotos(ids), () => void restorePhotos(ids));
  };
  const onRestoreSelected = async () => report('Restored', await restorePhotos(takeSelection()));
  const onUnlinkSelected = async () => {
    const eventId = filters.event!;
    const ids = takeSelection();
    const ok = await unlinkPhotosFromEvent(eventId, ids);
    report('Removed from the event:', ok ? { done: ids.length, failed: 0 } : { done: 0, failed: ids.length },
      () => void linkPhotosToEvent(eventId, ids, new Map()));
  };
  const onPurgeSelected = async () => {
    const ok = await confirm({
      title: `Delete ${photoCount(selectedPhotos.length)} for good`,
      message: purgeWarning(selectedPhotos.length),
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) report('Deleted for good:', await purgePhotos(takeSelection()));
  };
  const onEmptyTrash = async () => {
    const ok = await confirm({
      title: 'Empty the trash',
      message: PHOTO_TEXT.emptyTrashWarning,
      confirmLabel: 'Empty',
      destructive: true,
    });
    if (!ok) return;
    if (await emptyTrash()) toast(PHOTO_TEXT.trashEmptied);
    else toastError('Could not empty the trash.');
  };

  const onTilePress = (photoId: string) => {
    if (selecting) toggle(photoId);
    else navigation.navigate('PhotoViewer', { photoId, filters });
  };
  const onTileLongPress = (photoId: string) => {
    hapticSelection();
    toggle(photoId);
  };
  const onShowEvent = (eventId: string) => applyFilters((f) => ({ ...f, event: eventId }));
  const onRefresh = () => void refetch();
  const onEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  };
  const onPlace = (place: string) => applyFilters((f) => ({ ...f, place }));
  const onDayMap = (at: { lon: number; lat: number }) =>
    navigation.navigate('Tabs', { screen: 'Map', params: { at: { ...at, focus: 'photo' } } });
  const renderItem = ({ item }: { item: Entry }) => item.kind === 'header'
    ? (
      <DayHeader
        day={item.day}
        links={links}
        selecting={selecting}
        allSelected={item.day.items.every((p) => selected.has(p.id))}
        onToggleDay={toggleDay}
        onPlace={onPlace}
        onEvent={onShowEvent}
        onMap={onDayMap}
      />
    )
    : (
      <View style={styles.row}>
        {item.photos.map((photo) => (
          <PhotoTile
            key={photo.id}
            photo={photo}
            size={tile}
            eventId={links.get(photo.id)?.[0]}
            selecting={selecting}
            selected={selected.has(photo.id)}
            onPress={onTilePress}
            onLongPress={onTileLongPress}
            onShowEvent={onShowEvent}
          />
        ))}
      </View>
    );

  if (isLoading) return <Centered text="Loading…" />;
  if (items.length === 0 && (offline || error)) return <Centered text="Photos need a connection." />;

  const emptyText = photoEmptyText(filters);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <SyncBanner />
      <ScreenToolbar>
        {selecting ? (
          <>
            <IconButton icon={ICONS.close} size={20} onPress={() => setSelected(NO_SELECTION)} accessibilityLabel="Clear selection" />
            <Text style={[styles.selectedCount, { color: c.text }]}>{selected.size} selected</Text>
            {filters.trashed ? (
              <>
                <IconButton icon={ICONS.restore} onPress={() => void onRestoreSelected()} accessibilityLabel="Restore" />
                <IconButton icon={ICONS.deleteForever} iconColor={c.danger} onPress={() => void onPurgeSelected()} accessibilityLabel="Delete for good" />
              </>
            ) : (
              <>
                <IconButton icon={ICONS.link} onPress={() => setLinking(true)} accessibilityLabel="Link to event" />
                {filters.event && (
                  <IconButton icon={ICONS.linkOff} onPress={() => void onUnlinkSelected()} accessibilityLabel="Remove from event" />
                )}
                <IconButton icon={ICONS.delete} iconColor={c.danger} onPress={() => void onTrashSelected()} accessibilityLabel="Move to trash" />
              </>
            )}
          </>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip compact icon={ICONS.search} onPress={() => setSearchOpen(true)} accessibilityLabel="Search photos">
              Search
            </Chip>
            <Chip compact icon={ICONS.tune} onPress={() => setSheetOpen(true)}>
              {filterSummary || 'All photos'}
            </Chip>
            {filters.trashed && items.length > 0 && (
              <Chip compact icon={ICONS.deleteForever} onPress={() => void onEmptyTrash()}>Empty trash</Chip>
            )}
            <BackupChips onOpenSettings={() => navigation.navigate('Settings')} />
            {!filters.trashed && (stats?.trashedAssets ?? 0) > 0 && (
              <Chip compact icon={ICONS.delete} onPress={() => applyFilters({ sort: filters.sort, trashed: true })}>
                {`Trash · ${stats!.trashedAssets}`}
              </Chip>
            )}
            {failed > 0 && filters.status !== 'Failed' && (
              <Chip compact icon={ICONS.alert} onPress={() => applyFilters((f) => ({ ...f, status: 'Failed' }))}>
                {failed} failed to process
              </Chip>
            )}
          </ScrollView>
        )}
      </ScreenToolbar>

      <View style={styles.body}>
        <View style={styles.listArea} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {gridWidth > 0 && (
            <FlashList
              data={entries}
              keyExtractor={entryKey}
              getItemType={entryType}
              stickyHeaderIndices={headerIndices}
              onRefresh={onRefresh}
              refreshing={isRefetching}
              onEndReached={onEndReached}
              onEndReachedThreshold={1.5}
              renderItem={renderItem}
              ListEmptyComponent={<Text style={[styles.empty, { color: c.textMuted }]}>{emptyText}</Text>}
              ListFooterComponent={isFetchingNextPage ? <IndeterminateBar /> : null}
            />
          )}
        </View>
        {/* A pick filters to that year rather than scrolling: an unloaded year would mean paging through everything since. */}
        {railLabels.length > 1 && !selecting && (
          <LetterRail letters={railLabels} present={railPresent} onSelect={onRailSelect} />
        )}
      </View>

      {sheetOpen && (
        <PhotoFiltersSheet
          filters={filters}
          timeline={timeline}
          eventTitle={eventTitle}
          onChange={applyFilters}
          onDismiss={() => setSheetOpen(false)}
        />
      )}
      {searchOpen && (
        <PhotoSearchSheet
          timeline={timeline}
          onDate={(range) => applyFilters((f) => ({ ...f, ...range }))}
          onEvent={onShowEvent}
          onPlace={onPlace}
          onDismiss={() => setSearchOpen(false)}
        />
      )}
      {linking && (
        <LinkEventSheet
          photos={selectedPhotos}
          onDismiss={() => setLinking(false)}
          onLinked={() => setSelected(NO_SELECTION)}
        />
      )}
    </View>
  );
}

/** Camera-roll backup, where the photos are expected to appear. Nothing when backup is off or idle. */
function BackupChips({ onOpenSettings }: { onOpenSettings: () => void }) {
  const c = useColors();
  const { enabled, wifiOnly } = usePhotoBackup((s) => s.settings);
  const { pending, parked, progress } = usePhotoBackupStatus();
  if (!enabled) return null;

  return (
    <>
      {(progress || pending > 0) && (
        <Chip compact icon={ICONS.upload} onPress={onOpenSettings}>
          {progress
            ? `Uploading ${Math.round(progress.fraction * 100)}%${pending > 1 ? ` · ${pending - 1} more` : ''}`
            : `${pending} waiting${wifiOnly ? ' · Wi-Fi only' : ''}`}
        </Chip>
      )}
      {parked > 0 && (
        <Chip compact icon={ICONS.alert} textStyle={{ color: c.warning }} onPress={() => void retryParkedPhotos()}>
          {parked} didn’t upload · retry
        </Chip>
      )}
    </>
  );
}

const PhotoTile = memo(function PhotoTile({ photo, size, eventId, selecting, selected, onPress, onLongPress, onShowEvent }: {
  photo: PhotoListItemDto;
  size: number;
  eventId: string | undefined;
  selecting: boolean;
  selected: boolean;
  onPress: (photoId: string) => void;
  onLongPress: (photoId: string) => void;
  onShowEvent: (eventId: string) => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => onPress(photo.id)}
      onLongPress={() => onLongPress(photo.id)}
      style={{ width: size, height: size }}
    >
      {photo.thumbUrl ? (
        <Image
          // Presigned URLs rotate their signature, so the default URL-derived cache key would miss on
          // every refetch and re-download the whole grid.
          source={{ uri: photo.thumbUrl, cacheKey: thumbCacheKey(photo.id) }}
          style={[styles.thumb, selected && styles.thumbSelected]}
          contentFit="cover"
          transition={120}
          recyclingKey={photo.id}
        />
      ) : (
        <View style={[styles.thumb, styles.placeholder, { backgroundColor: c.surface }]}>
          <Text style={{ color: c.textMuted, fontSize: 11 }}>
            {photo.status === 'Failed' ? 'Failed' : '…'}
          </Text>
        </View>
      )}
      {photo.durationSeconds != null && (
        <Text style={styles.badge}>{fmtDuration(photo.durationSeconds)}</Text>
      )}
      {photo.purgesAt && (
        <Text style={[styles.badge, styles.badgeBottomLeft]}>{trashBadge(photo.purgesAt, new Date())}</Text>
      )}
      {eventId && !selecting && (
        <Pressable
          hitSlop={10}
          onPress={() => onShowEvent(eventId)}
          accessibilityLabel="Show this event's photos"
          style={[styles.badge, styles.badgeLeft]}
        >
          <Icon source={ICONS.calendar} size={12} color="#fff" />
        </Pressable>
      )}
      {selecting && (
        <View style={styles.check} pointerEvents="none">
          <Icon source={selected ? ICONS.checkCircle : ICONS.circle} size={22} color={selected ? c.primary : SCRIM.textOnImage} />
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  chips: { gap: 8, alignItems: 'center' },
  selectedCount: { flex: 1, fontSize: 16, fontWeight: '600' },
  body: { flex: 1, flexDirection: 'row' },
  listArea: { flex: 1 },
  row: { flexDirection: 'row', gap: GAP, paddingHorizontal: GAP, marginBottom: GAP },
  thumb: { width: '100%', height: '100%', borderRadius: 2 },
  thumbSelected: { transform: [{ scale: 0.88 }], borderRadius: 6 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', right: 4, bottom: 4, fontSize: 10, color: SCRIM.textOnImage,
    backgroundColor: SCRIM.onImage, paddingHorizontal: 4, borderRadius: 3, overflow: 'hidden',
  },
  badgeLeft: { left: 4, right: undefined, top: 4, bottom: undefined, paddingVertical: 2 },
  badgeBottomLeft: { left: 4, right: undefined },
  check: { position: 'absolute', top: 4, right: 4 },
  empty: { textAlign: 'center', marginTop: 48 },
});
