import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { hhmm } from '@lupira/cal-domain/time';
import { PickerButton } from './PickerButton';

/** Android system picker writing back the editors' string form ('HH:MM'). */
/** `nullLabel` as on DateField: a third dialog button that writes ''. */
export function TimeField({ value, onChange, placeholder = 'Set time', clearable = true, nullLabel }: {
  value: string; onChange: (v: string) => void; placeholder?: string; clearable?: boolean; nullLabel?: string;
}) {
  const open = () => {
    const base = new Date();
    if (value) {
      const [hh, mm] = value.split(':').map(Number);
      base.setHours(hh, mm, 0, 0);
    }
    DateTimePickerAndroid.open({ value: base, mode: 'time', is24Hour: true,
      ...(nullLabel && value ? { neutralButton: { label: nullLabel } } : {}),
      onChange: (e, d) => {
        if (e.type === 'neutralButtonPressed') onChange('');
        else if (e.type === 'set' && d) onChange(hhmm(d));
      },
    });
  };
  return (
    <PickerButton text={value || placeholder} isSet={!!value} onPress={open} onClear={clearable ? () => onChange('') : undefined} />
  );
}
