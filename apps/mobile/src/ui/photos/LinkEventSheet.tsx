import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { List, Portal, Text } from 'react-native-paper';
import { fmtWhen } from '@lupira/cal-domain/time';
import { toast, toastError } from '../../feedback/toast';
import { linkPhotosToEvent, useLinkCandidates, usePhotoEventLinks } from '../../state/usePhotoEventLinks';
import { invalidatePhotos } from '../../sync/reactivity';
import { useColors } from '../theme';
import { ICONS } from '../icons';

/** One picker for linking a single photo or a selection, in the same sheet shape as the filters. */
export function LinkEventSheet({ photos, onDismiss, onLinked }: {
  photos: readonly { id: string; takenAt: string }[];
  onDismiss: () => void;
  onLinked?: () => void;
}) {
  const c = useColors();
  const links = usePhotoEventLinks();
  const { data: candidates, isLoading } = useLinkCandidates(photos.map((p) => p.takenAt), true);
  const [busy, setBusy] = useState(false);

  const onPick = async (itemId: string) => {
    setBusy(true);
    const { linked, failed } = await linkPhotosToEvent(itemId, photos.map((p) => p.id), links);
    setBusy(false);
    invalidatePhotos();
    if (failed > 0) toastError(`Linked ${linked}, ${failed} failed.`);
    else toast(linked === 1 ? 'Linked to the event' : `Linked ${linked} photos`);
    onLinked?.();
    onDismiss();
  };

  return (
    <Portal>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onDismiss}>
        <Pressable style={[styles.sheet, { backgroundColor: c.surface }]}>
          <ScrollView>
            <Text style={[styles.title, { color: c.text }]}>
              {photos.length === 1 ? 'Link to an event' : `Link ${photos.length} photos to an event`}
            </Text>
            {isLoading && <Text style={[styles.muted, { color: c.textMuted }]}>Looking…</Text>}
            {!isLoading && (candidates ?? []).length === 0 && (
              <Text style={[styles.muted, { color: c.textMuted }]}>No events around this time.</Text>
            )}
            {(candidates ?? []).map((item) => (
              <List.Item
                key={item.id}
                title={item.title ?? 'Untitled event'}
                description={fmtWhen(item.start, item.isAllDay)}
                left={(props) => <List.Icon {...props} icon={ICONS.calendar} />}
                disabled={busy}
                onPress={() => void onPick(item.id)}
              />
            ))}
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
  muted: { fontSize: 13, marginVertical: 8 },
});
