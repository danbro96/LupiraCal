import type { MapSince } from '@lupira/cal-domain/mapWindow';
import { create } from 'zustand';
import { getDb } from '../data/db/expoDb';
import { migrate } from '../data/db/schema';
import { getMeta, setMeta } from '../data/mirror';

/** Small user preferences, persisted in mirror_meta (same reasoning as bridge-store: shared ground the
 *  data layer can read, and no brittle SecureStore key destructuring). */

const DEBUG_KEY = 'prefs.debugEnabled';
const SHOW_SYSTEM_KEY = 'prefs.showSystemCalendars';
const SHOW_TASKS_KEY = 'prefs.showTaskDeadlines';
const HOUR_HEIGHT_KEY = 'prefs.weekHourHeight';
const ALL_DAY_ROWS_KEY = 'prefs.allDayRows';
const CALENDAR_MODE_KEY = 'prefs.calendarMode';
const LAST_CALENDARS_KEY = 'prefs.lastCalendarIds';
const MAP_SINCE_KEY = 'prefs.mapSince';
const MAP_LAYERS_KEY = 'prefs.mapLayers';

export const DEFAULT_HOUR_HEIGHT = 44;
// Four is the most a SegmentedPicker fits on a 360dp phone (Paper's 76dp minimum per segment).
export const ALL_DAY_ROW_OPTIONS = ['1', '2', '3', 'all'] as const;
export type AllDayRows = (typeof ALL_DAY_ROW_OPTIONS)[number];
const isAllDayRows = (v: string | null): v is AllDayRows => ALL_DAY_ROW_OPTIONS.includes(v as AllDayRows);
// '4' was an option once; it reads as "show them all" now rather than silently dropping to the default.
const readAllDayRows = (v: string | null): AllDayRows => (isAllDayRows(v) ? v : v === '4' ? 'all' : '3');

export type CalendarMode = 'month' | 'week';
export const MAP_SINCE_OPTIONS: readonly MapSince[] = ['week', 'month', 'year', 'all'];
const isMapSince = (v: string | null): v is MapSince => MAP_SINCE_OPTIONS.includes(v as MapSince);

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
  /** System-class calendars (Inbox, Availability, agent scaffolding …) are developer/agent surfaces —
   *  hidden from lists, pickers, AND grids unless this is on. Birthdays is Agenda-class: unaffected. */
  showSystemCalendars: boolean;
  /** Task deadlines from LupiraTasks (online-only third grid source). Default ON — unset means shown. */
  showTaskDeadlines: boolean;
  /** Week grid zoom (dp per hour), set by pinching the time axis. */
  hourHeight: number;
  /** Most rows the week's all-day strip takes; past it, the last row counts per day what is hidden. */
  allDayRows: AllDayRows;
  calendarMode: CalendarMode;
  /** Calendars the last new event was filed to — the next one starts there. */
  lastCalendarIds: string[];
  /** How far back the map's dated layers (events, photos, hotspots, movement) reach. */
  mapSince: MapSince;
  /** Map layer toggles the user changed; keys the map doesn't know are ignored. */
  mapLayers: Record<string, boolean>;
};

type PrefsActions = {
  init(): Promise<void>;
  setDebugEnabled(value: boolean): Promise<void>;
  setShowSystemCalendars(value: boolean): Promise<void>;
  setShowTaskDeadlines(value: boolean): Promise<void>;
  setHourHeight(value: number): Promise<void>;
  setAllDayRows(value: AllDayRows): Promise<void>;
  setCalendarMode(value: CalendarMode): Promise<void>;
  setLastCalendarIds(value: string[]): Promise<void>;
  setMapSince(value: MapSince): Promise<void>;
  setMapLayers(value: Record<string, boolean>): Promise<void>;
};

export const usePrefs = create<Prefs & PrefsActions>((set) => ({
  loaded: false,
  debugEnabled: false,
  showSystemCalendars: false,
  showTaskDeadlines: true,
  hourHeight: DEFAULT_HOUR_HEIGHT,
  allDayRows: '3',
  calendarMode: 'month',
  lastCalendarIds: [],
  mapSince: 'month',
  mapLayers: {},

  init: async () => {
    const db = await getDb();
    await migrate(db);
    set({
      debugEnabled: (await getMeta(db, DEBUG_KEY)) === '1',
      showSystemCalendars: (await getMeta(db, SHOW_SYSTEM_KEY)) === '1',
      showTaskDeadlines: (await getMeta(db, SHOW_TASKS_KEY)) !== '0',
      hourHeight: Number(await getMeta(db, HOUR_HEIGHT_KEY)) || DEFAULT_HOUR_HEIGHT,
      allDayRows: readAllDayRows(await getMeta(db, ALL_DAY_ROWS_KEY)),
      calendarMode: (await getMeta(db, CALENDAR_MODE_KEY)) === 'week' ? 'week' : 'month',
      lastCalendarIds: parseJson(await getMeta(db, LAST_CALENDARS_KEY), isStringArray, []),
      mapSince: await getMeta(db, MAP_SINCE_KEY).then((v) => (isMapSince(v) ? v : 'month')),
      mapLayers: parseJson(await getMeta(db, MAP_LAYERS_KEY), isFlagRecord, {}),
      loaded: true,
    });
  },

  setDebugEnabled: async (value) => {
    set({ debugEnabled: value });
    const db = await getDb();
    await db.exclusive((tx) => setMeta(tx, DEBUG_KEY, value ? '1' : '0'));
  },

  setShowSystemCalendars: async (value) => {
    set({ showSystemCalendars: value });
    const db = await getDb();
    await db.exclusive((tx) => setMeta(tx, SHOW_SYSTEM_KEY, value ? '1' : '0'));
  },

  setShowTaskDeadlines: async (value) => {
    set({ showTaskDeadlines: value });
    const db = await getDb();
    await db.exclusive((tx) => setMeta(tx, SHOW_TASKS_KEY, value ? '1' : '0'));
  },

  setHourHeight: async (value) => {
    set({ hourHeight: value });
    const db = await getDb();
    await db.exclusive((tx) => setMeta(tx, HOUR_HEIGHT_KEY, String(value)));
  },

  setAllDayRows: async (value) => {
    set({ allDayRows: value });
    const db = await getDb();
    await db.exclusive((tx) => setMeta(tx, ALL_DAY_ROWS_KEY, value));
  },

  setCalendarMode: async (value) => {
    set({ calendarMode: value });
    const db = await getDb();
    await db.exclusive((tx) => setMeta(tx, CALENDAR_MODE_KEY, value));
  },

  setLastCalendarIds: async (value) => {
    set({ lastCalendarIds: value });
    const db = await getDb();
    await db.exclusive((tx) => setMeta(tx, LAST_CALENDARS_KEY, JSON.stringify(value)));
  },

  setMapSince: async (value) => {
    set({ mapSince: value });
    const db = await getDb();
    await db.exclusive((tx) => setMeta(tx, MAP_SINCE_KEY, value));
  },

  setMapLayers: async (value) => {
    set({ mapLayers: value });
    const db = await getDb();
    await db.exclusive((tx) => setMeta(tx, MAP_LAYERS_KEY, JSON.stringify(value)));
  },
}));
