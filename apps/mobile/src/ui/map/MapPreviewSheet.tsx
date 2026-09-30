import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Icon, Text } from 'react-native-paper';
import { initialsOf } from '@lupira/cal-domain/contactNames';
import { displayTitle } from '@lupira/cal-domain/itemLabels';
import type { MapHit } from '@lupira/cal-domain/mapHits';
import { hotspotStats } from '@lupira/cal-domain/mapFeatures';
import { fmtDate, fmtDateTime, fmtTime, parseYmd } from '@lupira/cal-domain/time';
import { MAP_COLORS, type MapTheme } from '@lupira/cal-tokens/map';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { avatarColor } from '../hooks/palette';
import { ICONS } from '../icons';
import { radii, spacing, useColors } from '../theme';

export type HitAction = 'open' | 'day' | 'zoom';

const ROW_THUMB = 40;

/** What a tap on the map found. One thing gets a preview card with its way into the full screen; several —
 *  a contact's home with events and photos on it — get a list, and a row opens its screen directly. */
export function MapPreviewSheet({ hits, theme, onAction, onDismiss }: {
  hits: MapHit[];
  theme: MapTheme;
  onAction: (hit: MapHit, action: HitAction) => void;
  onDismiss: () => void;
}) {
  const single = hits.length === 1 ? hits[0] : null;
  return (
    <Sheet title={single ? undefined : `${hits.length} things here`} onDismiss={onDismiss}>
      {single ? (
        <HitCard hit={single} theme={theme} onAction={onAction} />
      ) : (
        <ScrollView>
          {hits.map((hit) => <HitRow key={hit.key} hit={hit} theme={theme} onAction={onAction} />)}
        </ScrollView>
      )}
    </Sheet>
  );
}

function HitCard({ hit, theme, onAction }: { hit: MapHit; theme: MapTheme; onAction: (hit: MapHit, action: HitAction) => void }) {
  const c = useColors();
  const { title, detail } = describe(hit);
  const actions = actionsFor(hit);
  return (
    <View style={styles.card}>
      {hit.kind === 'photo' && hit.thumbUrl && (
        <Image source={{ uri: hit.thumbUrl }} style={styles.cardImage} contentFit="cover" transition={150} />
      )}
      <View style={styles.cardHead}>
        <Leading hit={hit} theme={theme} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{title}</Text>
          {detail.map((line) => <Text key={line} style={[styles.detail, { color: c.textMuted }]} numberOfLines={2}>{line}</Text>)}
        </View>
      </View>
      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map(({ action, label }, i) => (
            <Button key={action} title={label} variant={i === 0 ? 'primary' : 'secondary'} onPress={() => onAction(hit, action)} />
          ))}
        </View>
      )}
    </View>
  );
}

function HitRow({ hit, theme, onAction }: { hit: MapHit; theme: MapTheme; onAction: (hit: MapHit, action: HitAction) => void }) {
  const c = useColors();
  const { title, detail } = describe(hit);
  const primary = actionsFor(hit)[0]?.action;
  return (
    <Pressable
      onPress={primary ? () => onAction(hit, primary) : undefined}
      disabled={!primary}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.bg }]}
      accessibilityRole={primary ? 'button' : undefined}
    >
      {hit.kind === 'photo' && hit.thumbUrl
        ? <Image source={{ uri: hit.thumbUrl }} style={styles.rowThumb} contentFit="cover" />
        : <Leading hit={hit} theme={theme} />}
      <View style={styles.body}>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>{title}</Text>
        {detail[0] && <Text style={[styles.detail, { color: c.textMuted }]} numberOfLines={1}>{detail[0]}</Text>}
      </View>
      {primary && <Icon source={ICONS.chevronRight} size={20} color={c.textMuted} />}
    </Pressable>
  );
}

/** A glyph in the layer's own colour, so a row reads as the same kind of dot it came from. */
function Leading({ hit, theme }: { hit: MapHit; theme: MapTheme }) {
  const colors = MAP_COLORS[theme];
  if (hit.kind === 'contact') {
    return <Avatar.Text size={ROW_THUMB} label={initialsOf(hit.name)} style={{ backgroundColor: avatarColor(hit.contactId) }} />;
  }
  const [icon, color] = {
    event: [ICONS.event, hit.kind === 'event' ? hit.color ?? colors.eventFallback : colors.eventFallback],
    photo: [ICONS.photo, colors.photo],
    photoCell: [ICONS.photos, colors.photo],
    saved: [ICONS.saved, colors.saved],
    hotspot: [ICONS.target, colors.hotspot],
    visit: [ICONS.timeline, colors.visitFill],
  }[hit.kind];
  return (
    <View style={[styles.leading, { backgroundColor: `${color}22` }]}>
      <Icon source={icon} size={22} color={color} />
    </View>
  );
}

function describe(hit: MapHit): { title: string; detail: string[] } {
  switch (hit.kind) {
    case 'event':
      return { title: displayTitle(hit.title), detail: hit.start ? [fmtDateTime(new Date(hit.start))] : [] };
    case 'contact':
      return { title: hit.name, detail: [[hit.addressType ?? 'Lives here', hit.placeName].filter(Boolean).join(' · ')] };
    case 'photo':
      return { title: hit.placeLabel ?? 'Photo', detail: [fmtDateTime(new Date(hit.takenAt))] };
    case 'photoCell':
      return { title: `${hit.count} photos`, detail: ['Zoom in to see them'] };
    case 'saved':
      return { title: hit.label, detail: ['Saved place'] };
    case 'hotspot':
      return {
        title: hit.label ?? 'Unnamed spot',
        detail: [hotspotStats(hit), hit.firstDay && hit.lastDay ? `${fmtDate(parseYmd(hit.firstDay))} – ${fmtDate(parseYmd(hit.lastDay))}` : ''].filter(Boolean),
      };
    case 'visit':
      return {
        title: hit.placeLabel ?? 'Stay',
        detail: [`${fmtDate(new Date(hit.arriveTs))} · ${fmtTime(new Date(hit.arriveTs))}–${fmtTime(new Date(hit.departTs))} · ${hit.durationMin} min`],
      };
  }
}

function actionsFor(hit: MapHit): { action: HitAction; label: string }[] {
  switch (hit.kind) {
    case 'event': return [{ action: 'open', label: 'Open event' }];
    case 'contact': return [{ action: 'open', label: 'Open contact' }];
    case 'photo': return [{ action: 'open', label: 'Open photo' }, { action: 'day', label: 'All from this day' }];
    case 'photoCell': return [{ action: 'zoom', label: 'Zoom in' }];
    case 'visit': return [{ action: 'day', label: 'Photos from this day' }];
    case 'saved':
    case 'hotspot':
      return [];
  }
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  cardImage: { width: '100%', height: 220, borderRadius: radii.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md },
  rowThumb: { width: ROW_THUMB, height: ROW_THUMB, borderRadius: radii.sm },
  rowTitle: { fontSize: 15 },
  leading: { width: ROW_THUMB, height: ROW_THUMB, borderRadius: ROW_THUMB / 2, alignItems: 'center', justifyContent: 'center' },
});
