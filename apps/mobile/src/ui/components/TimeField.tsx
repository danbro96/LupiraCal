import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { localTime } from '../../domain/editors';
import { PickerButton } from './PickerButton';

/** Android system picker writing back the editors' string form ('HH:MM'). */
export function TimeField({ value, onChange, placeholder = 'Set time', clearable = true }: {
  value: string; onChange: (v: string) => void; placeholder?: string; clearable?: boolean;
}) {
  const open = () => {
    const base = new Date();
    if (value) {
      const [hh, mm] = value.split(':').map(Number);
      base.setHours(hh, mm, 0, 0);
    }
    DateTimePickerAndroid.open({ value: base, mode: 'time', is24Hour: true,
      onChange: (e, d) => {
        if (e.type === 'set' && d) onChange(localTime(d));
      },
    });
  };
  return (
    <PickerButton text={value || placeholder} isSet={!!value} onPress={open} onClear={clearable ? () => onChange('') : undefined} />
  );
}
