import { useState } from 'react';
import { Menu } from 'react-native-paper';
import { PickerButton } from './PickerButton';

/** A value button that opens a menu of `options`; Paper's menu scrolls when the list outgrows the screen. */
export function MenuField({ options, value, placeholder, onChange }: {
  options: { value: string; label: string }[]; value: string; placeholder: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find((o) => o.value === value)?.label;
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={<PickerButton text={label ?? placeholder} isSet={!!label} onPress={() => setOpen(true)} />}
    >
      {options.map((o) => (
        <Menu.Item
          key={o.value}
          title={o.label}
          onPress={() => {
            setOpen(false);
            onChange(o.value);
          }}
        />
      ))}
    </Menu>
  );
}
