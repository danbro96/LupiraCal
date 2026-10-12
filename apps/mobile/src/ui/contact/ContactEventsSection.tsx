import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { rsvpLabel } from '@lupira/cal-domain/participation';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, List, Text } from 'react-native-paper';
import type { ContactEventRow } from '../../data/queries/contactEvents';
import { useContactEvents } from '../../state/useContactEvents';
import { useCalendarColors } from '../hooks/palette';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';
import { AddToEventSheet } from './AddToEventSheet';

const SHOWN = 5;

/** The events this contact is on, upcoming soonest-first then past most-recent-first, from the mirror. */
export function ContactEventsSection({ contactId, onOpen }: { contactId: string; onOpen: (itemId: string) => void }) {
  const c = useColors();
  const { data: rows = [] } = useContactEvents(contactId);
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOWN);
  const upcoming = shown.filter((r) => r.next_utc !== null);
  const past = shown.filter((r) => r.next_utc === null);

  return (
    <>
      <View style={styles.heading}>
        <List.Subheader style={styles.subheader}>Events</List.Subheader>
        <Button compact icon={ICONS.add} onPress={() => setAdding(true)}>Add to event</Button>
      </View>
      {rows.length === 0 && <Text style={[styles.inset, styles.muted, { color: c.textMuted }]}>Not on any event yet</Text>}
      {upcoming.map((r) => <EventRow key={r.id} row={r} onOpen={onOpen} />)}
      {past.length > 0 && upcoming.length > 0 && <Text style={[styles.inset, styles.label, { color: c.textMuted }]}>Past</Text>}
      {past.map((r) => <EventRow key={r.id} row={r} onOpen={onOpen} />)}
      {rows.length > SHOWN && (
        <Button compact style={styles.more} onPress={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all (${rows.length})`}
        </Button>
      )}
      {adding && (
        <AddToEventSheet contactId={contactId} attending={new Set(rows.map((r) => r.id))} onDismiss={() => setAdding(false)} />
      )}
    </>
  );
}

function EventRow({ row, onOpen }: { row: ContactEventRow; onOpen: (itemId: string) => void }) {
  const colorOf = useCalendarColors();
  const when = row.next_utc ?? row.last_utc;
  return (
    <List.Item
      onPress={() => onOpen(row.id)}
      title={displayTitle(row.title)}
      description={[when ? fmtWhen(when, row.is_all_day === 1) : 'No date', rsvpLabel(row.rsvp)].join(' · ')}
      style={styles.dense}
      left={() => <View style={[styles.dot, { backgroundColor: colorOf(row.calendar_id) }]} />}
    />
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.sm },
  subheader: { flex: 1 },
  inset: { paddingHorizontal: spacing.lg },
  dense: { paddingVertical: 0 },
  muted: { fontSize: 13 },
  label: { fontSize: 12, marginTop: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, alignSelf: 'center', marginLeft: spacing.lg },
  more: { alignSelf: 'flex-start', marginLeft: spacing.sm },
});
