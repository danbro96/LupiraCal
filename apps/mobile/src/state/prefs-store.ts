import { create } from 'zustand';
import { readMeta, writeMeta } from '../sync/meta';

/** Small user preferences, persisted in the sync kernel's meta table (same reasoning as bridge-store). */

const DEBUG_KEY = 'prefs.debugEnabled';
const CALENDAR_CHOICES_KEY = 'prefs.calendarChoices';
const SHOW_TASKS_KEY = 'prefs.showTaskDeadlines';
const HOUR_HEIGHT_KEY = 'prefs.weekHourHeight';
const ALL_DAY_ROWS_KEY = 'prefs.allDayRows';
const CALENDAR_MODE_KEY = 'prefs.calendarMode';
const LAST_CALENDARS_KEY = 'prefs.lastCalendarIds';

export const DEFAULT_HOUR_HEIGHT = 44;
// Four is the most a SegmentedPicker fits on a 360dp phone (Paper's 76dp minimum per segment).
export const ALL_DAY_ROW_OPTIONS = ['1', '2', '3', 'all'] as const;
export type AllDayRows = (typeof ALL_DAY_ROW_OPTIONS)[number];
const isAllDayRows = (v: string | null): v is AllDayRows => ALL_DAY_ROW_OPTIONS.includes(v as AllDayRows);
// '4' was an option once; it reads as "show them all" now rather than silently dropping to the default.
const readAllDayRows = (v: string | null): AllDayRows => (isAllDayRows(v) ? v : v === '4' ? 'all' : '3');

export type CalendarMode = 'month' | 'week';

function parseJson<T>(raw: string | null, valid: (v: unknown) => v is T, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isFlagRecord = (v: unknown): v is Record<string, boolean> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'boolean');

type Prefs = {
  loaded: boolean;
  /** Gates the Developer + debug-log entries in Settings. */
  debugEnabled: boolean;
  /** Calendars the user showed or hid; the rest follow `@lupira/cal-domain/calendars` defaults. */
  calendarChoices: Record<string, boolean>;
  /** Task deadlines from LupiraTasks (online-only third grid source). Default ON — unset means shown. */
  showTaskDeadlines: boolean;
  /** Week grid zoom (dp per hour), set by pinching the time axis. */
  hourHeight: number;
  /** Most rows the week's all-day strip takes; past it, the last row counts per day what is hidden. */
  allDayRows: AllDayRows;
  calendarMode: CalendarMode;
  /** Calendars the last new event was filed to — the next one starts there. */
  lastCalendarIds: string[];
};

type PrefsActions = {
  init(): Promise<void>;
  setDebugEnabled(value: boolean): Promise<void>;
  setCalendarShown(calendarId: string, shown: boolean): Promise<void>;
  setShowTaskDeadlines(value: boolean): Promise<void>;
  setHourHeight(value: number): Promise<void>;
  setAllDayRows(value: AllDayRows): Promise<void>;
  setCalendarMode(value: CalendarMode): Promise<void>;
  setLastCalendarIds(value: string[]): Promise<void>;
};

export const usePrefs = create<Prefs & PrefsActions>((set, get) => ({
  loaded: false,
  debugEnabled: false,
  calendarChoices: {},
  showTaskDeadlines: true,
  hourHeight: DEFAULT_HOUR_HEIGHT,
  allDayRows: '3',
  calendarMode: 'month',
  lastCalendarIds: [],

  init: async () => {
    set({
      debugEnabled: (await readMeta(DEBUG_KEY)) === '1',
      calendarChoices: parseJson(await readMeta(CALENDAR_CHOICES_KEY), isFlagRecord, {}),
      showTaskDeadlines: (await readMeta(SHOW_TASKS_KEY)) !== '0',
      hourHeight: Number(await readMeta(HOUR_HEIGHT_KEY)) || DEFAULT_HOUR_HEIGHT,
      allDayRows: readAllDayRows(await readMeta(ALL_DAY_ROWS_KEY)),
      calendarMode: (await readMeta(CALENDAR_MODE_KEY)) === 'week' ? 'week' : 'month',
      lastCalendarIds: parseJson(await readMeta(LAST_CALENDARS_KEY), isStringArray, []),
      loaded: true,
    });
  },

  setDebugEnabled: async (value) => {
    set({ debugEnabled: value });
    await writeMeta(DEBUG_KEY, value ? '1' : '0');
  },

  setCalendarShown: async (calendarId, shown) => {
    const calendarChoices = { ...get().calendarChoices, [calendarId]: shown };
    set({ calendarChoices });
    await writeMeta(CALENDAR_CHOICES_KEY, JSON.stringify(calendarChoices));
  },

  setShowTaskDeadlines: async (value) => {
    set({ showTaskDeadlines: value });
    await writeMeta(SHOW_TASKS_KEY, value ? '1' : '0');
  },

  setHourHeight: async (value) => {
    set({ hourHeight: value });
    await writeMeta(HOUR_HEIGHT_KEY, String(value));
  },

  setAllDayRows: async (value) => {
    set({ allDayRows: value });
    await writeMeta(ALL_DAY_ROWS_KEY, value);
  },

  setCalendarMode: async (value) => {
    set({ calendarMode: value });
    await writeMeta(CALENDAR_MODE_KEY, value);
  },

  setLastCalendarIds: async (value) => {
    set({ lastCalendarIds: value });
    await writeMeta(LAST_CALENDARS_KEY, JSON.stringify(value));
  },
}));
