import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Chip, Text } from 'react-native-paper';
import { toast, toastError } from '../../feedback/toast';
import { linkPhotosToEvent, unlinkPhotosFromEvent, useLinkedEvents, usePhotoEventLinks } from '../../state/usePhotoEventLinks';
import { useColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { ICONS } from '../icons';
import { LinkEventSheet } from './LinkEventSheet';

/** The events a photo belongs to. The edge lives in cal-api as a generic Relation
 *  (`toKind: 'photo'`), the same one tasks and engagements already use. */
export function PhotoEventLinks({ photoId, takenAt }: { photoId: string; takenAt: string }) {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const links = usePhotoEventLinks();
  const linked = useLinkedEvents(links.get(photoId) ?? []);
  const [picking, setPicking] = useState(false);

  const onRemove = async (eventId: string) => {
    if (!(await unlinkPhotosFromEvent(eventId, [photoId]))) {
      toastError('Could not remove the link.');
      return;
    }
    toast('Removed from the event', {
      action: { label: 'Undo', onPress: () => void linkPhotosToEvent(eventId, [photoId], new Map()) },
    });
  };

  return (
    <View style={styles.root}>
      {linked.length === 0 && (
        <Text style={[styles.muted, { color: c.textMuted }]}>Not linked to an event.</Text>
      )}
      <View style={styles.chips}>
        {linked.map((event) => (
          <Chip key={event.id} compact icon={ICONS.calendar}
            onPress={() => navigation.navigate('ItemDetail', { itemId: event.id })}
            onClose={() => void onRemove(event.id)} closeIconAccessibilityLabel="Remove from event">
            {event.title}
          </Chip>
        ))}
      </View>
      <Button mode="text" compact onPress={() => setPicking(true)}>Link to event…</Button>
      {picking && <LinkEventSheet photos={[{ id: photoId, takenAt }]} onDismiss={() => setPicking(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  muted: { fontSize: 13 },
});
