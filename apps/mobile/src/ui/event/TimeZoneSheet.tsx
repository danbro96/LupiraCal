import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { List, Text } from 'react-native-paper';
import {
  canonicalTimeZone, deviceTimeZone, fmtZoneOffset, zoneChoices, zoneCity, zoneLabel,
} from '@lupira/cal-domain/zonedTime';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { ICONS } from '../icons';
import { useColors } from '../theme';

/** `at` = the event's start, so a winter event entered in summer shows its winter offset. */
export function zoneSummary(timeZone: string, at?: Date): string {
  return zoneLabel(timeZone, at, 'this phone');
}

/** The travel zones plus any IANA id typed in full ("Asia/Kathmandu") — the engine validates it. */
export function TimeZoneSheet({ value, at, onPick, onDismiss }: {
  value: string;
  at?: Date;
  onPick: (timeZone: string) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const [q, setQ] = useState('');
  const device = deviceTimeZone();
  // An engine without zone data validates nothing, and the list stays empty rather than offering zones it can't convert.
  const zones = zoneChoices(value);
  const term = q.trim().toLowerCase();
  const shown = term ? zones.filter((z) => z.toLowerCase().includes(term) || zoneCity(z).toLowerCase().includes(term)) : zones;
  const typed = q.trim() ? canonicalTimeZone(q.trim()) : null;

  const pick = (zone: string) => {
    onPick(zone);
    onDismiss();
  };

  return (
    <Sheet anchor="top" onDismiss={onDismiss}>
      <TextField style={fieldGap} label="Time zone" placeholder="City or region/city" autoFocus autoCapitalize="none" autoCorrect={false} value={q} onChangeText={setQ} />
      <Text style={[styles.hint, { color: c.textMuted }]}>The times you enter are read in this zone, and a repeating event keeps its local time across DST.</Text>
      <ScrollView keyboardShouldPersistTaps="handled">
        {typed && !zones.includes(typed) && (
          <List.Item title={zoneCity(typed)} description={`${typed} · ${fmtZoneOffset(typed, at)}`} left={(p) => <List.Icon {...p} icon={ICONS.public} />} onPress={() => pick(typed)} />
        )}
        {shown.map((zone) => (
          <List.Item
            key={zone}
            title={zoneCity(zone)}
            description={`${zone} · ${fmtZoneOffset(zone, at)}${zone === device ? ' · this phone' : ''}`}
            right={() => (zone === value ? <List.Icon icon={ICONS.check} color={c.primary} /> : null)}
            onPress={() => pick(zone)}
          />
        ))}
        {shown.length === 0 && !typed && (
          <Text style={[styles.hint, { color: c.textMuted }]}>No match — type the full id, like Asia/Kathmandu.</Text>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, marginVertical: 6 },
});
