import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Icon, Menu, Text } from 'react-native-paper';
import { NO_ATTENDEES, attendeeSummary, rsvpLabel } from '@lupira/cal-domain/participation';
import { rsvpTone } from '@lupira/cal-tokens/color';
import type { ItemAttendee } from '../../domain/docTypes';
import type { RsvpStatus } from '../../domain/ops';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';

const COLLAPSED_LIMIT = 8;
const RSVP_CHOICES: RsvpStatus[] = ['Accepted', 'Tentative', 'Declined', 'NeedsAction'];

/** One wrapping chip per person with the RSVP as its icon, under a line that counts the replies. `onJoin`
 *  leads the row with a Join chip — for an event you're not on. `onOpen` makes each chip open that person;
 *  `onRespond` makes holding one pick their RSVP. */
export function AttendeeChips({ attendees, nameOf, onJoin, onOpen, onRespond }: {
  attendees: ItemAttendee[];
  nameOf: (contactId: string) => string;
  onJoin?: () => void;
  onOpen?: (contactId: string) => void;
  onRespond?: (contactId: string, status: RsvpStatus) => void;
}) {
  const c = useColors();
  const [expanded, setExpanded] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const shown = expanded ? attendees : attendees.slice(0, COLLAPSED_LIMIT);
  const hidden = attendees.length - shown.length;

  const rsvpLook = (status: string) => {
    const label = rsvpLabel(status);
    const tone = rsvpTone(status);
    const color = tone === 'muted' ? c.textMuted : c[tone];
    switch (tone) {
      case 'success': return { icon: ICONS.check, color, label };
      case 'danger': return { icon: ICONS.close, color, label };
      case 'warning': return { icon: ICONS.help, color, label };
      default: return { icon: ICONS.schedule, color, label };
    }
  };
  const rsvp = (a: ItemAttendee) => {
    if (!a.participationId) return { icon: ICONS.upload, color: c.textMuted, label: 'invite pending sync' };
    return rsvpLook(a.status);
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
          const chip = (
            <Chip
              key={a.contactId}
              compact
              accessibilityLabel={`${nameOf(a.contactId)}, ${r.label}`}
              accessibilityHint={onRespond ? 'Hold to set the reply' : undefined}
              icon={({ size }) => <Icon source={r.icon} size={size} color={r.color} />}
              onPress={onOpen ? () => onOpen(a.contactId) : undefined}
              onLongPress={onRespond ? () => setResponding(a.contactId) : undefined}
            >
              {nameOf(a.contactId)}
            </Chip>
          );
          if (!onRespond) return chip;
          return (
            <Menu key={a.contactId} visible={responding === a.contactId} onDismiss={() => setResponding(null)} anchor={chip}>
              {RSVP_CHOICES.map((status) => {
                const look = rsvpLook(status);
                return (
                  <Menu.Item
                    key={status}
                    title={look.label}
                    leadingIcon={({ size }) => <Icon source={look.icon} size={size} color={look.color} />}
                    trailingIcon={status === a.status ? ICONS.check : undefined}
                    onPress={() => {
                      setResponding(null);
                      if (status !== a.status) onRespond(a.contactId, status);
                    }}
                  />
                );
              })}
            </Menu>
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
