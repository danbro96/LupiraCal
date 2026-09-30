import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Icon, Text } from 'react-native-paper';
import type { ItemAttendee } from '../../domain/docTypes';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';
import { attendeeSummary, rsvpLabel } from './rsvp';

const COLLAPSED_LIMIT = 8;

/** One wrapping chip per person with the RSVP as its icon, under a line that counts the replies. `onJoin`
 *  leads the row with a Join chip — for an event you're not on. */
export function AttendeeChips({ attendees, nameOf, onJoin }: {
  attendees: ItemAttendee[];
  nameOf: (contactId: string) => string;
  onJoin?: () => void;
}) {
  const c = useColors();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? attendees : attendees.slice(0, COLLAPSED_LIMIT);
  const hidden = attendees.length - shown.length;

  const rsvp = (a: ItemAttendee) => {
    if (!a.participationId) return { icon: ICONS.upload, color: c.textMuted, label: 'invite pending sync' };
    const label = rsvpLabel(a.status);
    switch (a.status) {
      case 'Accepted': return { icon: ICONS.check, color: c.success, label };
      case 'Declined': return { icon: ICONS.close, color: c.danger, label };
      case 'Tentative': return { icon: ICONS.help, color: c.warning, label };
      default: return { icon: ICONS.schedule, color: c.textMuted, label };
    }
  };

  return (
    <View>
      <Text variant="labelMedium" style={[styles.summary, { color: c.textMuted }]}>
        {attendees.length > 0 ? attendeeSummary(attendees) : 'Nobody invited'}
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
