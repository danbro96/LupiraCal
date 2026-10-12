import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { clampBirthdayDay, daysInMonth, monthNames } from '@lupira/cal-domain/partialDate';

const MONTHS = monthNames();

/** A year-less birthday: month by name, then a day that fits the month. */
export function BirthdayMonthDay({ month, day, onChange }: { month: string; day: string; onChange: (month: string, day: string) => void }) {
  const days = daysInMonth(Number(month) || 1);
  return (
    <>
      <TextField
        select
        label="Month"
        sx={{ minWidth: 140 }}
        value={month}
        onChange={(e) => onChange(e.target.value, clampBirthdayDay(e.target.value, day))}
      >
        {MONTHS.map((name, i) => (
          <MenuItem key={name} value={String(i + 1)}>{name}</MenuItem>
        ))}
      </TextField>
      <TextField select label="Day" sx={{ minWidth: 80 }} value={day} onChange={(e) => onChange(month, e.target.value)}>
        {Array.from({ length: days }, (_, i) => (
          <MenuItem key={i} value={String(i + 1)}>{i + 1}</MenuItem>
        ))}
      </TextField>
    </>
  );
}
