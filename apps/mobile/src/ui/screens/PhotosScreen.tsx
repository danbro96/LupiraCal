import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { Chip, Icon, IconButton, Text } from 'react-native-paper';
import { deletePhoto } from '@lupira/cal-api/fetch/photo';
import { fmtDuration } from '@lupira/cal-domain/photoFormat';
import { fmtPhotoRange, photoTimeline, yearRange } from '@lupira/cal-domain/photoTimeline';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { hapticSelection } from '../../feedback/haptics';
import { toast, toastError } from '../../feedback/toast';
import { usePhotoBackup } from '../../state/photo-backup-store';
import { useLinkedEvents, usePhotoEventLinks } from '../../state/usePhotoEventLinks';
import { DEFAULT_PHOTO_FILTERS, groupByDay, usePhotoLibrary, usePhotoStats, type PhotoQueryFilters } from '../../state/usePhotoLibrary';
import { usePhotoBackupStatus } from '../../sync/photoBackupStatus';
import { retryParkedPhotos } from '../../sync/photoUploader';
import { invalidatePhotos } from '../../sync/reactivity';
import { Centered } from '../components/Centered';
import { useConfirm } from '../components/ConfirmDialog';
import { IndeterminateBar } from '../components/IndeterminateBar';
import { LetterRail } from '../components/LetterRail';
import { ScreenToolbar } from '../components/ScreenToolbar';
import { SyncBanner } from '../components/SyncBanner';
import { useColors } from '../theme';
import { LinkEventSheet } from '../photos/LinkEventSheet';
import { PhotoFiltersSheet } from '../photos/PhotoFiltersSheet';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { ICONS } from '../icons';

const COLUMNS = 3;
const GAP = 2;
const NO_SELECTION: ReadonlySet<string> = new Set();

const photoKey = (item: PhotoListItemDto) => item.id;
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
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [linking, setLinking] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  // A filter change can take selected photos out of view, and acting on unseen photos would surprise.
  const applyFilters = useCallback((next: PhotoQueryFilters | ((f: PhotoQueryFilters) => PhotoQueryFilters)) => {
    setSelected(NO_SELECTION);
    setFilters(next);
  }, []);

  // Handoffs (a map pin's day, an event's photos) are consumed and cleared, so the same one arriving
  // twice still applies after the user has changed the filters in between.
  const { from, to, event } = route.params ?? {};
  useEffect(() => {
    if (!from && !event) return;
    if (event) applyFilters((f) => ({ sort: f.sort, event }));
    else if (from) applyFilters((f) => ({ ...f, from, to: to ?? from, event: undefined }));
    tabNavigation.setParams({ from: undefined, to: undefined, event: undefined });
  }, [from, to, event, applyFilters, tabNavigation]);

  const { items, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage, refetch, isRefetching } =
    usePhotoLibrary(filters);
  const links = usePhotoEventLinks();
  const { data: stats } = usePhotoStats();
  const [eventTitle] = useLinkedEvents(filters.event ? [filters.event] : []).map((e) => e.title);

  const sections = useMemo(() => groupByDay(items), [items]);
  const tile = (gridWidth - GAP * (COLUMNS + 1)) / COLUMNS;
  const failed = stats?.byStatus?.Failed ?? 0;
  const timeline = useMemo(
    () => photoTimeline(stats?.byMonth ?? {}, filters.sort !== 'TakenAtAsc'),
    [stats, filters.sort],
  );
  const railLabels = useMemo(() => timeline.map((y) => yearLabel(y.year)), [timeline]);
  const railPresent = useMemo(() => new Set(railLabels), [railLabels]);
  const onRailSelect = useCallback((label: string) => {
    const year = timeline.find((y) => yearLabel(y.year) === label)?.year;
    if (year) applyFilters((f) => ({ ...f, ...yearRange(year) }));
  }, [timeline, applyFilters]);

  const filterSummary = [
    filters.sort === 'TakenAtAsc' ? 'Oldest first' : null,
    filters.event ? (eventTitle ?? 'One event') : null,
    filters.kind,
    filters.located === true ? 'Has a place' : filters.located === false ? 'No location' : null,
    filters.place ? `“${filters.place}”` : null,
    filters.status,
    filters.from ? fmtPhotoRange(filters.from, filters.to) : null,
  ].filter(Boolean).join(' · ');

  const selecting = selected.size > 0;
  const toggle = useCallback((photoId: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(photoId)) next.delete(photoId);
    else next.add(photoId);
    return next;
  }), []);
  const toggleDay = useCallback((day: PhotoListItemDto[]) => setSelected((prev) => {
    const next = new Set(prev);
    const all = day.every((p) => next.has(p.id));
    for (const p of day) {
      if (all) next.delete(p.id);
      else next.add(p.id);
    }
    return next;
  }), []);
  const selectedPhotos = useMemo(() => items.filter((p) => selected.has(p.id)), [items, selected]);

  const onDeleteSelected = async () => {
    const count = selectedPhotos.length;
    const ok = await confirm({
      title: count === 1 ? 'Delete photo' : `Delete ${count} photos`,
      message: 'This removes the originals and their thumbnails from storage. It cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    let failures = 0;
    for (const photo of selectedPhotos) {
      const r = await deletePhoto(photo.id).catch(() => null);
      if (r?.status !== 204) failures++;
    }
    setSelected(NO_SELECTION);
    invalidatePhotos();
    if (failures > 0) toastError(`Deleted ${count - failures}, ${failures} failed.`);
    else toast(count === 1 ? 'Photo deleted' : `Deleted ${count} photos`);
  };

  // Stable list props: a new renderItem re-renders every mounted day row and tile.
  const onTilePress = useCallback((photoId: string) => {
    if (selecting) toggle(photoId);
    else navigation.navigate('PhotoViewer', { photoId, filters });
  }, [selecting, toggle, navigation, filters]);
  const onTileLongPress = useCallback((photoId: string) => {
    hapticSelection();
    toggle(photoId);
  }, [toggle]);
  const onShowEvent = useCallback((eventId: string) => applyFilters((f) => ({ ...f, event: eventId })), [applyFilters]);
  const onRefresh = useCallback(() => void refetch(), [refetch]);
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const renderSectionHeader = useCallback(({ section }: { section: (typeof sections)[number] }) => (
    <View style={[styles.dayHeader, { backgroundColor: c.bg }]}>
      <Text style={[styles.dayLabel, { color: c.textMuted }]}>{section.label}</Text>
      {selecting && (
        <Pressable hitSlop={8} onPress={() => toggleDay(section.data)}>
          <Text style={[styles.dayLabel, { color: c.primary }]}>
            {section.data.every((p) => selected.has(p.id)) ? 'Deselect day' : 'Select day'}
          </Text>
        </Pressable>
      )}
    </View>
  ), [c, selecting, selected, toggleDay]);
  // SectionList renders one row per item, so each "row" is a full day laid out as a wrapped grid.
  const renderItem = useCallback(({ index, section }: { index: number; section: (typeof sections)[number] }) => {
    if (index % COLUMNS !== 0) return null;
    const row = section.data.slice(index, index + COLUMNS);
    return (
      <View style={styles.row}>
        {row.map((photo) => (
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
  }, [tile, links, selecting, selected, onTilePress, onTileLongPress, onShowEvent]);

  if (error) return <Centered text="Photos need a connection." />;
  if (isLoading) return <Centered text="Loading…" />;

  const onlyEvent = filters.event && !filters.kind && filters.located === undefined && !filters.place
    && !filters.status && !filters.from;
  const emptyText = onlyEvent
    ? 'No photos linked to this event yet.'
    : filterSummary ? 'No photos match these filters.' : 'No photos yet.';

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <SyncBanner />
      <ScreenToolbar>
        {selecting ? (
          <>
            <IconButton icon={ICONS.close} size={20} onPress={() => setSelected(NO_SELECTION)} accessibilityLabel="Clear selection" />
            <Text style={[styles.selectedCount, { color: c.text }]}>{selected.size} selected</Text>
            <IconButton icon={ICONS.link} onPress={() => setLinking(true)} accessibilityLabel="Link to event" />
            <IconButton icon={ICONS.delete} iconColor={c.danger} onPress={() => void onDeleteSelected()} accessibilityLabel="Delete" />
          </>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip compact icon={ICONS.tune} onPress={() => setSheetOpen(true)}>
              {filterSummary || 'All photos'}
            </Chip>
            <BackupChips onOpenSettings={() => navigation.navigate('Settings')} />
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
            <SectionList
              sections={sections}
              keyExtractor={photoKey}
              stickySectionHeadersEnabled
              onRefresh={onRefresh}
              refreshing={isRefetching}
              onEndReached={onEndReached}
              onEndReachedThreshold={1.5}
              renderSectionHeader={renderSectionHeader}
              renderItem={renderItem}
              windowSize={7}
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
          source={{ uri: photo.thumbUrl }}
          style={[styles.thumb, selected && styles.thumbSelected]}
          contentFit="cover"
          transition={120}
          // Presigned URLs rotate their signature, so the default URL-derived cache key would miss on
          // every refetch and re-download the whole grid.
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
          <Icon source={selected ? ICONS.checkCircle : ICONS.circle} size={22} color={selected ? c.primary : '#fff'} />
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
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6 },
  dayLabel: { fontSize: 13, fontWeight: '600' },
  thumb: { width: '100%', height: '100%', borderRadius: 2 },
  thumbSelected: { transform: [{ scale: 0.88 }], borderRadius: 6 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', right: 4, bottom: 4, fontSize: 10, color: '#fff',
    backgroundColor: '#0009', paddingHorizontal: 4, borderRadius: 3, overflow: 'hidden',
  },
  badgeLeft: { left: 4, right: undefined, top: 4, bottom: undefined, paddingVertical: 2 },
  check: { position: 'absolute', top: 4, right: 4 },
  empty: { textAlign: 'center', marginTop: 48 },
});
