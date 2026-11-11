import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import type { FuzzyDate } from '@danbro96/lupira-domain-contacts/fuzzyDate';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { daysInMonth, monthNames } from '@lupira/cal-domain/partialDate';
import { ICONS } from '../icons';
import { spacing } from '../theme';
import { Field } from './Field';
import { MenuField } from './MenuField';

const NONE = 'none';
const MONTH_OPTIONS = [{ value: NONE, label: '—' }, ...monthNames().map((label, i) => ({ value: String(i + 1), label }))];
const dayOptions = (year: number, month: number) =>
  [{ value: NONE, label: '—' }, ...Array.from({ length: daysInMonth(month, year) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))];
const yearText = (d: FuzzyDate | null) => (d ? String(d.year) : '');

function fuzzyDate(year: number, month: number | null | undefined, day: number | null | undefined): FuzzyDate {
  if (month == null) return { year, month: null, day: null };
  return { year, month, day: day == null ? null : Math.min(day, daysInMonth(month, year)) };
}

/** A date known to the year, month or day, the precision being the certainty ("2015" = sometime in 2015). The year
 *  is typed; month and day are picked once the part before them is in, "—" leaving them out. */
export function FuzzyDateField({ label, value, onChange }: {
  label: string; value: FuzzyDate | null; onChange: (v: FuzzyDate | null) => void;
}) {
  const [shown, setShown] = useState(value);
  const [year, setYear] = useState(() => yearText(value));
  if (value !== shown) {
    setShown(value);
    setYear(yearText(value));
  }

  const typeYear = (text: string) => {
    const digits = text.replace(/\D/g, '');
    setYear(digits);
    if (!digits) onChange(null);
    else if (/^[1-9]\d{3}$/.test(digits)) onChange(fuzzyDate(Number(digits), value?.month, value?.day));
  };
  const clear = () => {
    setYear('');
    onChange(null);
  };

  return (
    <Field label={label}>
      <View style={styles.row}>
        <TextField
          style={styles.year}
          label="Year"
          keyboardType="number-pad"
          maxLength={4}
          value={year}
          onChangeText={typeYear}
          onBlur={() => setYear(yearText(value))}
        />
        {value && (
          <View style={styles.month}>
            <MenuField
              placeholder="Month"
              options={MONTH_OPTIONS}
              value={value.month ? String(value.month) : ''}
              onChange={(m) => onChange(fuzzyDate(value.year, m === NONE ? null : Number(m), value.day))}
            />
          </View>
        )}
        {value?.month != null && (
          <View style={styles.day}>
            <MenuField
              placeholder="Day"
              options={dayOptions(value.year, value.month)}
              value={value.day ? String(value.day) : ''}
              onChange={(d) => onChange(fuzzyDate(value.year, value.month, d === NONE ? null : Number(d)))}
            />
          </View>
        )}
        {(!!value || !!year) && <IconButton icon={ICONS.close} size={16} onPress={clear} accessibilityLabel={`Clear ${label.toLowerCase()}`} />}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  year: { width: 96 },
  month: { flex: 3 },
  day: { flex: 2 },
});
