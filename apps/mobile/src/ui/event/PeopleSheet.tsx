import { useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { Chip, List } from 'react-native-paper';
import { rankByInteraction, withPartnersFirst } from '@lupira/cal-domain/contactRank';
import { attendeeName } from '@danbro96/lupira-domain-contacts/contactNames';
import { matchesTerms, searchTerms } from '@danbro96/lupira-domain-core/textSearch';
import { useContactList, usePartnerIds } from '../../state/useContactList';
import { useParticipationSummary } from '../../state/useParticipationSummary';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { ICONS } from '../icons';
import { spacing } from '../theme';

const LIST_LIMIT = 50;
const NO_PARTNERS: ReadonlySet<string> = new Set();

/** Contacts come from the offline mirror; the ranking by who you meet most is online and fails open to
 *  alphabetical. Picks apply live — the editor's Save sends the invites — and clear the search, keeping the
 *  sheet open. You are never ranked: while you're not on the event, an "Add me" row sits above everyone else;
 *  with no search, the current spouses and partners of those picked come next. */
export function PeopleSheet({ selected, me, onChange, onDismiss }: {
  selected: string[];
  me: string | null;
  onChange: (contactIds: string[]) => void;
  onDismiss: () => void;
}) {
  const { data: contacts } = useContactList();
  const { data: summary } = useParticipationSummary(true);
  const partnerIds = usePartnerIds(selected);
  const [q, setQ] = useState('');

  const ranked = rankByInteraction(contacts ?? [], summary);
  const byId = new Map((contacts ?? []).map((row) => [row.id, row]));
  const terms = searchTerms(q);
  const term = terms.length > 0;
  const { partners, others } = withPartnersFirst(
    ranked.filter((row) => row.id !== me && !selected.includes(row.id) && matchesTerms(terms, row.displayName, row.doc.nickname)),
    term ? NO_PARTNERS : partnerIds,
  );
  const candidates = others.slice(0, LIST_LIMIT);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  const pick = (id: string) => {
    toggle(id);
    setQ('');
    Keyboard.dismiss();
  };
  const contactItem = (contact: (typeof candidates)[number]) => (
    <List.Item
      key={contact.id}
      title={contact.displayName}
      description={contact.doc.nickname}
      left={(p) => <List.Icon {...p} icon={ICONS.person} />}
      onPress={() => pick(contact.id)}
    />
  );

  return (
    <Sheet anchor="top" onDismiss={onDismiss}>
      <TextField style={fieldGap} label="Search contacts" autoFocus value={q} onChangeText={setQ} />
      <ScrollView keyboardShouldPersistTaps="handled">
        {me && !selected.includes(me) && !term && (
          <List.Item
            title="Add me"
            description="You're not on this event"
            left={(p) => <List.Icon {...p} icon={ICONS.personAdd} />}
            onPress={() => pick(me)}
          />
        )}
        {partners.length > 0 && <List.Subheader>Partners</List.Subheader>}
        {partners.map(contactItem)}
        <List.Subheader>{term ? 'Matches' : summary?.length ? 'People you meet most' : 'Contacts'}</List.Subheader>
        {candidates.map(contactItem)}
      </ScrollView>
      {selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map((id) => {
            const name = attendeeName(id, me, (x) => byId.get(x)?.displayName);
            return (
              <Chip key={id} compact closeIcon={ICONS.close} onPress={() => toggle(id)} onClose={() => toggle(id)} accessibilityLabel={`Remove ${name}`}>
                {name}
              </Chip>
            );
          })}
        </View>
      )}
      <Button title="Done" onPress={onDismiss} style={styles.done} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.sm },
  done: { marginTop: 8 },
});
