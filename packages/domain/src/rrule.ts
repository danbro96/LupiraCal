// Human-readable summary of an iCal RRULE (the canonical field the API round-trips).

const DAY_NAMES: Record<string, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

const FREQ_UNITS: Record<string, [string, string]> = {
  DAILY: ['day', 'days'],
  WEEKLY: ['week', 'weeks'],
  MONTHLY: ['month', 'months'],
  YEARLY: ['year', 'years'],
};

export function describeRrule(rrule: string): string {
  const parts = new Map<string, string>();
  for (const token of rrule.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = token.split('=');
    if (k && v) parts.set(k.toUpperCase(), v);
  }

  const freq = parts.get('FREQ')?.toUpperCase();
  const unit = freq ? FREQ_UNITS[freq] : undefined;
  if (!unit) return rrule;

  const interval = Number(parts.get('INTERVAL') ?? '1');
  let text = interval === 1 ? `Every ${unit[0]}` : `Every ${interval} ${unit[1]}`;

  const byday = parts.get('BYDAY');
  if (byday) {
    const days = byday
      .split(',')
      .map((d) => DAY_NAMES[d.replace(/^[+-]?\d+/, '')] ?? d)
      .join(', ');
    text += ` on ${days}`;
  }

  const byMonthDay = parts.get('BYMONTHDAY');
  if (byMonthDay) text += ` on day ${byMonthDay}`;

  const count = parts.get('COUNT');
  if (count) text += `, ${count} times`;

  const until = parts.get('UNTIL');
  if (until) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(until);
    if (m) text += `, until ${m[1]}-${m[2]}-${m[3]}`;
  }

  return text;
}

/** How an event that doesn't repeat reads in the repeat picker. */
export const NO_REPEAT = 'Never';

/** Quick-pick presets for the item editor. */
export const RRULE_PRESETS: Array<{ label: string; rrule: string }> = [
  { label: 'Daily', rrule: 'FREQ=DAILY' },
  { label: 'Weekdays', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Weekly', rrule: 'FREQ=WEEKLY' },
  { label: 'Monthly', rrule: 'FREQ=MONTHLY' },
  { label: 'Yearly', rrule: 'FREQ=YEARLY' },
];
