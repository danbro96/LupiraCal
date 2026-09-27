import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import { fmtDuration } from '@lupira/cal-domain/photoFormat';
import { parseYmd } from '@lupira/cal-domain/time';
import type { PhotoListItemDto } from '@lupira/cal-api/models';
import { usePhotoEventLinks } from '../../state/usePhotoEventLinks';
import { DEFAULT_PHOTO_FILTERS, groupByDay, usePhotoLibrary, usePhotoStats, type PhotoQueryFilters } from '../../state/usePhotoLibrary';
import { Centered } from '../components/Centered';
import { IndeterminateBar } from '../components/IndeterminateBar';
import { SyncBanner } from '../components/SyncBanner';
import { useColors } from '../theme';
import { PhotoFiltersSheet } from '../photos/PhotoFiltersSheet';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { ICONS } from '../icons';

const COLUMNS = 3;
const GAP = 2;

function dayRangeLabel(from: string, to?: string): string {
  const start = parseYmd(from).toLocaleDateString(undefined, { dateStyle: 'medium' });
  if (!to || to === from) return start;
  return `${start} – ${parseYmd(to).toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

const photoKey = (item: PhotoListItemDto) => item.id;

/** The whole library — including photos with no location, which the map can never show. */
export function PhotosScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const route = useRoute<RouteProp<TabParamList, 'Photos'>>();
  const [filters, setFilters] = useState<PhotoQueryFilters>(DEFAULT_PHOTO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  // A map pin hands over a day; arriving on the tab again with a new one has to replace the old.
  const { from, to } = route.params ?? {};
  useEffect(() => {
    if (from) setFilters((f) => ({ ...f, from, to: to ?? from }));
  }, [from, to]);

  const { items, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage, refetch, isRefetching } =
    usePhotoLibrary(filters);
  const links = usePhotoEventLinks();
  const { data: stats } = usePhotoStats();

  const sections = useMemo(() => groupByDay(items), [items]);
  const tile = (width - GAP * (COLUMNS + 1)) / COLUMNS;
  const failed = stats?.byStatus?.Failed ?? 0;

  const filterSummary = [
    filters.sort === 'TakenAtAsc' ? 'Oldest first' : null,
    filters.kind,
    filters.located === true ? 'Has a place' : filters.located === false ? 'No location' : null,
    filters.place ? `“${filters.place}”` : null,
    filters.status,
    filters.from ? dayRangeLabel(filters.from, filters.to) : null,
  ].filter(Boolean).join(' · ');

  // Stable list props: a new renderItem re-renders every mounted day row and tile.
  const openPhoto = useCallback(
    (photoId: string) => navigation.navigate('PhotoViewer', { photoId, filters }),
    [navigation, filters],
  );
  const onRefresh = useCallback(() => void refetch(), [refetch]);
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const renderSectionHeader = useCallback(({ section }: { section: (typeof sections)[number] }) => (
    <Text style={[styles.dayHeader, { backgroundColor: c.bg, color: c.textMuted }]}>{section.label}</Text>
  ), [c]);
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
            linked={(links.get(photo.id)?.length ?? 0) > 0}
            onOpen={openPhoto}
          />
        ))}
      </View>
    );
  }, [tile, links, openPhoto]);

  if (error) return <Centered text="Photos need a connection." />;
  if (isLoading) return <Centered text="Loading…" />;

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <SyncBanner />
      <View style={styles.toolbar}>
        <Chip compact icon={ICONS.tune} onPress={() => setSheetOpen(true)}>
          {filterSummary || 'All photos'}
        </Chip>
        {failed > 0 && (
          <Chip
            compact
            icon={ICONS.alert}
            onPress={() => setFilters((f) => ({ ...f, status: 'Failed' }))}
          >
            {failed} failed
          </Chip>
        )}
      </View>

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
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.textMuted }]}>
            {filterSummary ? 'No photos match these filters.' : 'No photos yet.'}
          </Text>
        }
        ListFooterComponent={isFetchingNextPage ? <IndeterminateBar /> : null}
      />

      {sheetOpen && (
        <PhotoFiltersSheet
          filters={filters}
          onChange={setFilters}
          onDismiss={() => setSheetOpen(false)}
        />
      )}
    </View>
  );
}

const PhotoTile = memo(function PhotoTile({ photo, size, linked, onOpen }: {
  photo: PhotoListItemDto; size: number; linked: boolean; onOpen: (photoId: string) => void;
}) {
  const c = useColors();
  return (
    <Pressable onPress={() => onOpen(photo.id)} style={{ width: size, height: size }}>
      {photo.thumbUrl ? (
        <Image
          source={{ uri: photo.thumbUrl }}
          style={styles.thumb}
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
      {linked && <Text style={[styles.badge, styles.badgeLeft]}>event</Text>}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: GAP, paddingHorizontal: GAP, marginBottom: GAP },
  dayHeader: { fontSize: 13, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 6 },
  thumb: { width: '100%', height: '100%', borderRadius: 2 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', right: 4, bottom: 4, fontSize: 10, color: '#fff',
    backgroundColor: '#0009', paddingHorizontal: 4, borderRadius: 3, overflow: 'hidden',
  },
  badgeLeft: { left: 4, right: undefined, top: 4, bottom: undefined },
  empty: { textAlign: 'center', marginTop: 48 },
});
