import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Icon, Text } from 'react-native-paper';
import type { ItemAttendee } from '../../domain/docTypes';
import { ICONS } from '../icons';
import { useColors } from '../theme';
import { attendeeSummary, rsvpLabel } from './rsvp';

const COLLAPSED_LIMIT = 8;

/** One wrapping chip per person with the RSVP as its icon, under a line that counts the replies. */
export function AttendeeChips({ attendees, nameOf }: { attendees: ItemAttendee[]; nameOf: (contactId: string) => string }) {
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
      <Text variant="labelMedium" style={[styles.summary, { color: c.textMuted }]}>{attendeeSummary(attendees)}</Text>
      <View style={styles.chips}>
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
  summary: { marginTop: 12, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
