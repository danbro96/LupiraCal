import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { fmtDate, parseYmd } from '@lupira/cal-domain/time';
import { ymd } from '@lupira/cal-domain/time';
import { PickerButton } from './PickerButton';

/** Android system picker writing back the editors' string form ('yyyy-MM-dd'). `weekday` suits event days
 *  ("Tue 30 Sep"); without it the full date reads like a birthday ("30 Sep 1985"). `nullLabel` makes the value
 *  nullable from inside the dialog (a third button that writes ''), instead of a clear icon beside it. */
export function DateField({ value, onChange, placeholder = 'Set date', weekday = false, clearable = true, nullLabel }: {
  value: string; onChange: (v: string) => void; placeholder?: string; weekday?: boolean; clearable?: boolean; nullLabel?: string;
}) {
  const open = () =>
    DateTimePickerAndroid.open({
      // Midday so a DST shift cannot roll the date back a day.
      value: value ? new Date(`${value}T12:00:00`) : new Date(),
      mode: 'date',
      ...(nullLabel && value ? { neutralButton: { label: nullLabel } } : {}),
      onChange: (e, d) => {
        if (e.type === 'neutralButtonPressed') onChange('');
        else if (e.type === 'set' && d) onChange(ymd(d));
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
