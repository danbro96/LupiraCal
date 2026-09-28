import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Portal, Text } from 'react-native-paper';
import type { AssetKind, AssetStatus } from '@lupira/cal-api/models';
import {
  fmtMonth, fmtPhotoRange, monthRange, type TimelineYear, wholeSpan, yearRange,
} from '@lupira/cal-domain/photoTimeline';
import type { PhotoQueryFilters } from '../../state/usePhotoLibrary';
import { Input } from '../components/Input';
import { useColors } from '../theme';
import { ICONS } from '../icons';

/** Sort and filter controls, in the same Portal-and-backdrop sheet shape as the map's layer sheet. */
export function PhotoFiltersSheet({ filters, timeline, eventTitle, onChange, onDismiss }: {
  filters: PhotoQueryFilters;
  timeline: TimelineYear[];
  eventTitle: string | undefined;
  onChange: (next: PhotoQueryFilters) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const set = (patch: Partial<PhotoQueryFilters>) => onChange({ ...filters, ...patch });
  const toggle = <K extends keyof PhotoQueryFilters>(key: K, value: PhotoQueryFilters[K]) =>
    set({ [key]: filters[key] === value ? undefined : value } as Partial<PhotoQueryFilters>);

  const span = filters.from ? wholeSpan(filters.from, filters.to ?? filters.from) : null;
  const openYear = span?.kind === 'year' ? span.year : span?.kind === 'month' ? span.key.slice(0, 4) : null;
  const months = timeline.find((y) => y.year === openYear)?.months ?? [];
  const clearRange = { from: undefined, to: undefined };

  return (
    <Portal>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface }]}>
          <ScrollView>
            <Text style={[styles.title, { color: c.text }]}>Photos</Text>

            <Text style={[styles.label, { color: c.textMuted }]}>Order</Text>
            <View style={styles.row}>
              <Chip compact selected={filters.sort === 'TakenAtDesc'} showSelectedCheck
                onPress={() => set({ sort: 'TakenAtDesc' })}>Newest first</Chip>
              <Chip compact selected={filters.sort === 'TakenAtAsc'} showSelectedCheck
                onPress={() => set({ sort: 'TakenAtAsc' })}>Oldest first</Chip>
            </View>

            {filters.event && (
              <>
                <Text style={[styles.label, { color: c.textMuted }]}>Event</Text>
                <View style={styles.row}>
                  <Chip compact icon={ICONS.calendar} selected showSelectedCheck={false}
                    onPress={() => set({ event: undefined })} onClose={() => set({ event: undefined })}>
                    {eventTitle ?? 'One event'}
                  </Chip>
                </View>
              </>
            )}

            {timeline.length > 0 && (
              <>
                <Text style={[styles.label, { color: c.textMuted }]}>When</Text>
                <View style={styles.row}>
                  {filters.from && !span && (
                    <Chip compact selected showSelectedCheck onPress={() => set(clearRange)}>
                      {fmtPhotoRange(filters.from, filters.to)}
                    </Chip>
                  )}
                  {timeline.map((y) => (
                    <Chip key={y.year} compact selected={openYear === y.year} showSelectedCheck
                      onPress={() => set(span?.kind === 'year' && span.year === y.year ? clearRange : yearRange(y.year))}>
                      {y.year}
                    </Chip>
                  ))}
                </View>
                {months.length > 0 && (
                  <View style={[styles.row, styles.subRow]}>
                    {months.map((m) => {
                      const on = span?.kind === 'month' && span.key === m.key;
                      return (
                        <Chip key={m.key} compact selected={on} showSelectedCheck
                          onPress={() => set(on ? yearRange(m.key.slice(0, 4)) : monthRange(m.key))}>
                          {`${fmtMonth(m.key, 'short')} · ${m.count}`}
                        </Chip>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            <Text style={[styles.label, { color: c.textMuted }]}>Type</Text>
            <View style={styles.row}>
              {(['Photo', 'Video'] as AssetKind[]).map((kind) => (
                <Chip key={kind} compact selected={filters.kind === kind} showSelectedCheck
                  onPress={() => toggle('kind', kind)}>{kind}s</Chip>
              ))}
            </View>

            <Text style={[styles.label, { color: c.textMuted }]}>Location</Text>
            <View style={styles.row}>
              <Chip compact selected={filters.located === true} showSelectedCheck
                onPress={() => toggle('located', true)}>Has a place</Chip>
              {/* The only way to see photos the map can't show at all. */}
              <Chip compact selected={filters.located === false} showSelectedCheck
                onPress={() => toggle('located', false)}>No location</Chip>
            </View>

            <Text style={[styles.label, { color: c.textMuted }]}>Place</Text>
            <Input
              label="Place name"
              defaultValue={filters.place}
              onEndEditing={(e) => set({ place: e.nativeEvent.text.trim() || undefined })}
            />

            <Text style={[styles.label, { color: c.textMuted }]}>Status</Text>
            <View style={styles.row}>
              {(['Ready', 'Failed', 'Duplicate'] as AssetStatus[]).map((status) => (
                <Chip key={status} compact selected={filters.status === status} showSelectedCheck
                  onPress={() => toggle('status', status)}>{status}</Chip>
              ))}
            </View>

            <View style={styles.row}>
              <Chip compact icon={ICONS.close} onPress={() => onChange({ sort: filters.sort })}>Clear filters</Chip>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '80%' },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  label: { fontSize: 12, marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subRow: { marginTop: 8 },
});
