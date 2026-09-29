import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { List, Text } from 'react-native-paper';
import { RRULE_PRESETS, describeRrule } from '@lupira/cal-domain/rrule';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Sheet } from '../components/Sheet';
import { ICONS } from '../icons';
import { useColors } from '../theme';

export function RepeatSheet({ value, onPick, onDismiss }: {
  value: string;
  onPick: (rule: string) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const isPreset = value === '' || RRULE_PRESETS.some((p) => p.rrule === value);
  const [custom, setCustom] = useState(!isPreset);
  const [raw, setRaw] = useState(isPreset ? '' : value);

  const pick = (rule: string) => {
    onPick(rule);
    onDismiss();
  };
  const check = (on: boolean) => () => (on ? <List.Icon icon={ICONS.check} color={c.primary} /> : null);

  return (
    <Sheet title="Repeats" anchor={custom ? 'top' : 'bottom'} onDismiss={onDismiss}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <List.Item title="Never" right={check(value === '')} onPress={() => pick('')} />
        {RRULE_PRESETS.map((p) => (
          <List.Item key={p.rrule} title={p.label} right={check(value === p.rrule)} onPress={() => pick(p.rrule)} />
        ))}
        <List.Item title="Custom rule…" right={check(!isPreset)} onPress={() => setCustom(true)} />
        {custom && (
          <>
            <Input
              label="RRULE"
              placeholder="FREQ=WEEKLY;BYDAY=MO,TH"
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              value={raw}
              onChangeText={setRaw}
            />
            {!!raw.trim() && <Text style={[styles.prose, { color: c.textMuted }]}>{describeRrule(raw.trim())}</Text>}
            <Button title="Use this rule" disabled={!raw.trim()} onPress={() => pick(raw.trim())} style={styles.use} />
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  prose: { fontSize: 13, marginTop: 6 },
  use: { marginTop: 10 },
});
