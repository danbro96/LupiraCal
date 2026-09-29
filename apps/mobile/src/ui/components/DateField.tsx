import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { fmtDate, parseYmd } from '@lupira/cal-domain/time';
import { localDay } from '../../domain/editors';
import { PickerButton } from './PickerButton';

/** Android system picker writing back the editors' string form ('yyyy-MM-dd'). `weekday` suits event days
 *  ("Tue 30 Sep"); without it the full date reads like a birthday ("30 Sep 1985"). */
export function DateField({ value, onChange, placeholder = 'Set date', weekday = false, clearable = true }: {
  value: string; onChange: (v: string) => void; placeholder?: string; weekday?: boolean; clearable?: boolean;
}) {
  const open = () =>
    DateTimePickerAndroid.open({
      // Midday so a DST shift cannot roll the date back a day.
      value: value ? new Date(`${value}T12:00:00`) : new Date(),
      mode: 'date',
      onChange: (e, d) => {
        if (e.type === 'set' && d) onChange(localDay(d));
      },
    });
  return (
    <PickerButton
      text={value ? (weekday ? fmtEventDay(value) : fmtDate(parseYmd(value))) : placeholder}
      isSet={!!value}
      onPress={open}
      onClear={clearable ? () => onChange('') : undefined}
    />
  );
}

function fmtEventDay(value: string): string {
  const d = parseYmd(value);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) });
}
