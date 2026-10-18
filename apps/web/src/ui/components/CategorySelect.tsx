import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { ITEM_CATEGORIES } from '@lupira/cal-domain/itemCategory';
import { CategoryIcon } from './KindIcon';

/** `any` adds an empty "Any category" entry, for filtering. */
export function CategorySelect({ value, onChange, label, any }: {
  value: string;
  onChange: (category: string) => void;
  label?: string;
  any?: boolean;
}) {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{ htmlInput: { 'aria-label': 'Category' }, select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      {any && <MenuItem value="">Any category</MenuItem>}
      {ITEM_CATEGORIES.map((c) => (
        <MenuItem key={c} value={c}>
          <CategoryIcon category={c} sx={{ verticalAlign: -5, mr: 0.5 }} />{c}
        </MenuItem>
      ))}
    </TextField>
  );
}
