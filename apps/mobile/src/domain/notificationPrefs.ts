/** What this device notifies about. Every switch starts on; times are 'HH:MM' on the device's wall clock. */
export type NotifyPrefs = {
  /** Reminders you set on an event yourself. */
  eventReminders: boolean;
  /** A reminder before timed events you're going to (or maybe) that have none of their own. */
  defaultReminder: boolean;
  defaultMinutes: number;
  morningSummary: boolean;
  morningTime: string;
  birthdays: boolean;
  birthdayTime: string;
  askWhenInvited: boolean;
  remindToReply: boolean;
  replyLeadMinutes: number;
};

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  eventReminders: true,
  defaultReminder: true,
  defaultMinutes: 15,
  morningSummary: true,
  morningTime: '07:00',
  birthdays: true,
  birthdayTime: '09:00',
  askWhenInvited: true,
  remindToReply: true,
  replyLeadMinutes: 1440,
};

export const DEFAULT_MINUTE_OPTIONS = [5, 15, 30, 60] as const;
export const REPLY_LEAD_OPTIONS = [60, 180, 1440, 2880] as const;

/** The leads offered for one event's own reminder. */
export const REMINDER_LEADS = [5, 15, 30, 60, 120, 1440, 2880] as const;

export const NOTIFY_PREFIX = 'prefs.notify.';
export const notifyPrefKey = (field: keyof NotifyPrefs) => `${NOTIFY_PREFIX}${field}`;

const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Stored values by meta key; a missing or unreadable one keeps its default. */
export function notifyPrefsFrom(stored: Readonly<Record<string, string>>): NotifyPrefs {
  const prefs = { ...DEFAULT_NOTIFY_PREFS };
  for (const field of Object.keys(prefs) as (keyof NotifyPrefs)[]) {
    const raw = stored[notifyPrefKey(field)];
    if (raw === undefined) continue;
    const fallback = DEFAULT_NOTIFY_PREFS[field];
    if (typeof fallback === 'boolean') (prefs[field] as boolean) = raw === '1';
    else if (typeof fallback === 'number') (prefs[field] as number) = Number.isFinite(Number(raw)) && raw !== '' ? Number(raw) : fallback;
    else (prefs[field] as string) = isTime(raw) ? raw : fallback;
  }
  return prefs;
}

export function notifyPrefValue(value: NotifyPrefs[keyof NotifyPrefs]): string {
  return typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
}

export function leadLabel(minutes: number): string {
  if (minutes === 0) return 'At start';
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

type Reminder = { mode: string; minutesBefore: number | null };

/** Null is the default. */
export function sameReminder(a: Reminder | null, b: Reminder | null): boolean {
  const mode = (r: Reminder | null) => r?.mode ?? 'Default';
  return mode(a) === mode(b) && (mode(a) !== 'Before' || a?.minutesBefore === b?.minutesBefore);
}

/** An event's reminder as its row reads; `defaultMinutes` null = the default gives this event none. */
export function reminderLabel(reminder: Reminder | null, defaultMinutes: number | null): string {
  if (!reminder || reminder.mode === 'Default') return `Default (${defaultMinutes === null ? 'none' : leadLabel(defaultMinutes)})`;
  if (reminder.mode === 'Off') return 'Off';
  return `${leadLabel(reminder.minutesBefore ?? 0)} before`;
}
