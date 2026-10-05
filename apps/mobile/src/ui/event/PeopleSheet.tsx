import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { List } from 'react-native-paper';
import { rankByInteraction } from '@lupira/cal-domain/contactRank';
import { rsvpLabel } from '@lupira/cal-domain/participation';
import { attendeeName } from '@danbro96/lupira-domain-contacts/contactNames';
import { matchesTerms, searchTerms } from '@danbro96/lupira-domain-core/textSearch';
import type { ItemAttendee } from '../../domain/docTypes';
import { useContactList } from '../../state/useContactList';
import { useParticipationSummary } from '../../state/useParticipationSummary';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { ICONS } from '../icons';
import { useColors } from '../theme';

const LIST_LIMIT = 50;

/** Contacts come from the offline mirror; the ranking by who you meet most is online and fails open to
 *  alphabetical. Picks apply live — the editor's Save sends the invites. You are never ranked: while you're
 *  not on the event, a "You" row sits above everyone else. */
export function PeopleSheet({ selected, attendees, me, onChange, onDismiss }: {
  selected: string[];
  attendees: ItemAttendee[];
  me: string | null;
  onChange: (contactIds: string[]) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const { data: contacts } = useContactList();
  const { data: summary } = useParticipationSummary(true);
  const [q, setQ] = useState('');

  const ranked = rankByInteraction(contacts ?? [], summary);
  const byId = new Map((contacts ?? []).map((row) => [row.id, row]));
  const statusOf = new Map(attendees.map((a) => [a.contactId, a.status]));
  const terms = searchTerms(q);
  const term = terms.length > 0;
  const candidates = ranked
    .filter((row) => row.id !== me && !selected.includes(row.id) && matchesTerms(terms, row.displayName))
    .slice(0, LIST_LIMIT);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <Sheet anchor="top" onDismiss={onDismiss}>
      <TextField style={fieldGap} label="Search contacts" autoFocus value={q} onChangeText={setQ} />
      <ScrollView keyboardShouldPersistTaps="handled">
        {selected.length > 0 && <List.Subheader>Invited</List.Subheader>}
        {selected.map((id) => (
          <List.Item
            key={id}
            title={attendeeName(id, me, (x) => byId.get(x)?.displayName)}
            description={statusOf.has(id) ? rsvpLabel(statusOf.get(id)) : id === me ? 'Going' : 'Invited when you save'}
            left={(p) => <List.Icon {...p} icon={ICONS.person} />}
            right={() => <List.Icon icon={ICONS.check} color={c.primary} />}
            onPress={() => toggle(id)}
          />
        ))}
        {me && !selected.includes(me) && !term && (
          <List.Item
            title="Add me"
            description="You're not on this event"
            left={(p) => <List.Icon {...p} icon={ICONS.personAdd} />}
            onPress={() => toggle(me)}
          />
        )}
        <List.Subheader>{term ? 'Matches' : summary?.length ? 'People you meet most' : 'Contacts'}</List.Subheader>
        {candidates.map((row) => (
          <List.Item
            key={row.id}
            title={row.displayName}
            left={(p) => <List.Icon {...p} icon={ICONS.person} />}
            onPress={() => toggle(row.id)}
          />
        ))}
      </ScrollView>
      <Button title="Done" onPress={onDismiss} style={styles.done} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  done: { marginTop: 8 },
});
