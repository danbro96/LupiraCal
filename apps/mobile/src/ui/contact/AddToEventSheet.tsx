import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { useDeferredValue, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { List, Text } from 'react-native-paper';
import { inviteToItem } from '../../state/actions';
import { useItemSearch } from '../../state/useItemSearch';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';

const MIN_QUERY = 2;

/** Picks an event from the mirror to invite the contact to; the invite queues like any other write. */
export function AddToEventSheet({ contactId, attending, onDismiss }: {
  contactId: string;
  attending: Set<string>;
  onDismiss: () => void;
}) {
  const c = useColors();
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());
  const ready = q.length >= MIN_QUERY;
  const { data } = useItemSearch(ready ? q : '');
  const rows = ready ? data ?? [] : [];

  const add = (itemId: string, title: string | null) => {
    onDismiss();
    void inviteToItem(itemId, contactId).then(() => toast(`Added to ${displayTitle(title)}`));
  };

  return (
    <Sheet anchor="top" title="Add to event" onDismiss={onDismiss}>
      <TextField style={fieldGap} label="Search events" autoFocus value={query} onChangeText={setQuery} />
      <ScrollView keyboardShouldPersistTaps="handled">
        {!ready && <Text style={[styles.hint, { color: c.textMuted }]}>Title, description, category or tag</Text>}
        {ready && rows.length === 0 && <Text style={[styles.hint, { color: c.textMuted }]}>No matching events</Text>}
        {rows.map((r) => {
          const on = attending.has(r.id);
          const when = r.next_utc ?? r.last_utc;
          return (
            <List.Item
              key={r.id}
              title={displayTitle(r.title)}
              description={when ? fmtWhen(when, r.is_all_day === 1) : 'No date'}
              disabled={on}
              left={(p) => <List.Icon {...p} icon={ICONS.event} />}
              right={() => (on ? <List.Icon icon={ICONS.check} color={c.primary} /> : null)}
              onPress={() => add(r.id, r.title)}
            />
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { textAlign: 'center', marginVertical: spacing.lg },
});
