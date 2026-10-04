import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Icon, Text } from 'react-native-paper';
import { NO_ATTENDEES, attendeeSummary, rsvpLabel } from '@lupira/cal-domain/participation';
import { rsvpTone } from '@lupira/cal-tokens/color';
import type { ItemAttendee } from '../../domain/docTypes';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';

const COLLAPSED_LIMIT = 8;

/** One wrapping chip per person with the RSVP as its icon, under a line that counts the replies. `onJoin`
 *  leads the row with a Join chip — for an event you're not on. `onOpen` makes each chip open that person. */
export function AttendeeChips({ attendees, nameOf, onJoin, onOpen }: {
  attendees: ItemAttendee[];
  nameOf: (contactId: string) => string;
  onJoin?: () => void;
  onOpen?: (contactId: string) => void;
}) {
  const c = useColors();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? attendees : attendees.slice(0, COLLAPSED_LIMIT);
  const hidden = attendees.length - shown.length;

  const rsvp = (a: ItemAttendee) => {
    if (!a.participationId) return { icon: ICONS.upload, color: c.textMuted, label: 'invite pending sync' };
    const label = rsvpLabel(a.status);
    const tone = rsvpTone(a.status);
    const color = tone === 'muted' ? c.textMuted : c[tone];
    switch (tone) {
      case 'success': return { icon: ICONS.check, color, label };
      case 'danger': return { icon: ICONS.close, color, label };
      case 'warning': return { icon: ICONS.help, color, label };
      default: return { icon: ICONS.schedule, color, label };
    }
  };

  return (
    <View>
      <Text variant="labelMedium" style={[styles.summary, { color: c.textMuted }]}>
        {attendees.length > 0 ? attendeeSummary(attendees) : NO_ATTENDEES}
      </Text>
      <View style={styles.chips}>
        {onJoin && (
          <Chip compact mode="outlined" icon={({ size }) => <Icon source={ICONS.personAdd} size={size} color={c.primary} />} onPress={onJoin}>
            Join
          </Chip>
        )}
        {shown.map((a) => {
          const r = rsvp(a);
          return (
            <Chip
              key={a.contactId}
              compact
              accessibilityLabel={`${nameOf(a.contactId)}, ${r.label}`}
              icon={({ size }) => <Icon source={r.icon} size={size} color={r.color} />}
              onPress={onOpen ? () => onOpen(a.contactId) : undefined}
            >
              {nameOf(a.contactId)}
            </Chip>
          );
        })}
        {hidden > 0 && <Chip compact mode="outlined" onPress={() => setExpanded(true)}>{`+${hidden}`}</Chip>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: spacing.sm, marginBottom: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
