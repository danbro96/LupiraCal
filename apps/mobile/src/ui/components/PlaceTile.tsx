import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { placeSpanM } from '@lupira/cal-domain/mapZoom';
import { placeTitle } from '@lupira/cal-domain/places';
import { EMPHASIS } from '@lupira/cal-tokens/color';
import { copyText } from '../../feedback/copy';
import { toastError } from '../../feedback/toast';
import { usePlaceCoords } from '../../state/usePlaceLookup';
import { ICONS } from '../icons';
import { MiniMap } from '../map/MiniMap';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors } from '../theme';
import { IconButton } from './IconButton';

const THUMB = 64;

/** How the app shows a place: its name, the address, an optional meta line (address type, residency, who
 *  lives there) — one line each, ellipsized — and a map thumbnail. Tapping it opens the Map tab pinned on the
 *  place; holding it copies the address (the name, when there's no address yet); `directions` adds the
 *  hand-off to an external maps app. Offline the place can't be resolved — the label still shows, the rest
 *  waits for a connection. */
export function PlaceTile({ placeId, label, meta, muted, directions }: {
  placeId: string | null | undefined;
  /** Shown instead of the place's own name — an event's location label. */
  label?: string | null;
  meta?: string | null;
  /** A former or future address: present, but not where anyone is. */
  muted?: boolean;
  directions?: boolean;
}) {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const place = usePlaceCoords([placeId]).get(placeId ?? '');
  const point = place?.latitude != null && place.longitude != null ? { lat: place.latitude, lon: place.longitude } : null;
  const title = placeTitle(label, place?.name, placeId);
  const address = place?.formattedAddress && place.formattedAddress !== title ? place.formattedAddress : null;

  const openMap = point
    ? () => navigation.navigate('Tabs', { screen: 'Map', params: { at: { ...point, focus: 'place' } } })
    : undefined;
  const canCopy = !!(placeId || label);
  const copy = () => copyText(place?.formattedAddress || title, place?.formattedAddress ? 'Address' : 'Place name');
  const openDirections = () => {
    const query = point ? `${point.lat},${point.lon}` : address ?? title;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`)
      .catch(() => toastError('No maps app could open this place.'));
  };

  return (
    // Never `disabled`: that would block the hold too, and an unmapped place can still be copied.
    <Pressable
      onPress={openMap}
      onLongPress={canCopy ? copy : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${title}${address ? `, ${address}` : ''}${openMap ? '. Show on map' : ''}`}
      accessibilityHint={canCopy ? 'Hold to copy the address' : undefined}
      accessibilityActions={canCopy ? [{ name: 'longpress', label: 'Copy address' }] : undefined}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') copy(); }}
      style={({ pressed }) => [styles.tile, muted && styles.muted, pressed && { backgroundColor: c.surface }]}
    >
      <View style={styles.body}>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{title}</Text>
        {address && <Text style={[styles.line, { color: c.textMuted }]} numberOfLines={1} ellipsizeMode="tail">{address}</Text>}
        {!!meta && <Text style={[styles.meta, { color: muted ? c.textSubtle : c.textMuted }]} numberOfLines={1}>{meta}</Text>}
      </View>
      {directions && point && (
        <IconButton name={ICONS.directions} size={20} color={c.textMuted} onPress={openDirections} accessibilityLabel="Directions" />
      )}
      <MiniMap point={point} size={THUMB} spanM={placeSpanM(place)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.lg },
  muted: { opacity: EMPHASIS.faded },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '500' },
  line: { fontSize: 13 },
  meta: { fontSize: 12 },
});
