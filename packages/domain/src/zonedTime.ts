// Wall-clock ⇄ instant conversion in a named IANA zone. Instants stay UTC everywhere; a zone only interprets
// what an editor's date/time fields mean and where a series' occurrences fall.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** False for unknown ids — and for every id on an engine without zone support, so callers fall back to UTC. */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The engine's spelling of a zone id ("asia/tokyo" → "Asia/Tokyo"), or null if it names no zone. */
export function canonicalTimeZone(timeZone: string): string | null {
  if (!isValidTimeZone(timeZone)) return null;
  return formatterFor(timeZone).resolvedOptions().timeZone || null;
}

/** The device's IANA zone, or null where the engine can't name it. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// Offsets change only on quarter-hour instants, so one lookup per bucket serves every instant in it — which is what
// keeps expanding a multi-year daily series affordable.
const OFFSET_BUCKET_MS = 900_000;
const OFFSET_CACHE_LIMIT = 50_000;
const offsetCache = new Map<string, Map<number, number>>();

/** UTC offset of `timeZone` at instant `ms`, in ms (east positive). */
export function zoneOffsetMs(ms: number, timeZone: string): number {
  const bucket = Math.floor(ms / OFFSET_BUCKET_MS);
  let byBucket = offsetCache.get(timeZone);
  if (!byBucket) {
    byBucket = new Map();
    offsetCache.set(timeZone, byBucket);
  }
  let offset = byBucket.get(bucket);
  if (offset === undefined) {
    const at = bucket * OFFSET_BUCKET_MS;
    const parts = formatterFor(timeZone).formatToParts(new Date(at));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
    // Some engines still render midnight as 24 despite h23.
    offset = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - at;
    if (byBucket.size >= OFFSET_CACHE_LIMIT) byBucket.clear();
    byBucket.set(bucket, offset);
  }
  return offset;
}

/** An instant's wall clock in `timeZone`, as ms read as if UTC. */
export function toWallMs(ms: number, timeZone: string): number {
  return ms + zoneOffsetMs(ms, timeZone);
}

/** The instant a wall clock (ms read as if UTC) names in `timeZone`, resolved like NodaTime's InZoneLeniently: a
 *  time skipped by a forward shift moves later by the gap, one repeated by a backward shift takes the earlier. */
export function fromWallMs(wallMs: number, timeZone: string): number {
  // The offsets either side of any transition near this wall time; no zone changes twice within two days.
  const early = wallMs - zoneOffsetMs(wallMs - DAY_MS, timeZone);
  const late = wallMs - zoneOffsetMs(wallMs + DAY_MS, timeZone);
  if (early === late) return early;
  const readings = [early, late].filter((ms) => toWallMs(ms, timeZone) === wallMs);
  return readings.length > 0 ? Math.min(...readings) : early;
}

/** The instant a wall clock in `timeZone` shows `day` ('yyyy-MM-dd') at `time` ('HH:MM'). */
export function wallToInstant(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(fromWallMs(Date.UTC(y, m - 1, d, hh, mm), timeZone));
}

/** An instant as 'yyyy-MM-dd' + 'HH:MM' on a wall clock in `timeZone`. */
export function instantToWall(iso: string, timeZone: string): { day: string; time: string } {
  const w = new Date(toWallMs(new Date(iso).getTime(), timeZone));
  return {
    day: `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`,
    time: `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`,
  };
}

/** "UTC+2", "UTC−3:30" — the zone's offset at `at`. */
export function fmtZoneOffset(timeZone: string, at: Date = new Date()): string {
  const minutes = Math.round(zoneOffsetMs(at.getTime(), timeZone) / 60_000);
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${h}${rest ? `:${pad(rest)}` : ''}`;
}

/** "Europe/Stockholm" → "Stockholm"; "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');
}

/** Zones people actually travel to, for a picker that can't rely on `Intl.supportedValuesOf` existing. */
export const COMMON_TIME_ZONES: readonly string[] = [
  'UTC',
  'Europe/Stockholm', 'Europe/London', 'Europe/Lisbon', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Europe/Rome', 'Europe/Athens', 'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Moscow',
  'Atlantic/Reykjavik', 'Atlantic/Canary',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage',
  'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Pacific/Honolulu', 'Pacific/Auckland',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai',
  'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Perth', 'Australia/Sydney',
];

const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** The zone an event's wall-clock fields are read in: its own start zone, or this device's when it has none
 *  (or one this runtime can't resolve). */
export function eventZone(startTimezone: string | null | undefined): string | null {
  return isValidTimeZone(startTimezone) ? startTimezone : deviceTimeZone();
}

// The device's own zone goes through Date's local arithmetic, so the common case never needs Intl zone data.
const isDeviceZone = (zone: string | null | undefined) => !zone || zone === deviceTimeZone();

/** An instant as the wall clock of `zone` ({day:'yyyy-MM-dd', time:'HH:mm'}). */
export function isoToWall(iso: string, zone: string | null | undefined): { day: string; time: string } {
  if (!isDeviceZone(zone)) return instantToWall(iso, zone!);
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** A wall-clock day + time in `zone` as an ISO instant. */
export function wallToIso(day: string, time: string, zone: string | null | undefined): string {
  if (!isDeviceZone(zone)) return wallToInstant(day, time, zone!).toISOString();
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

