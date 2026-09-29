import { deviceTimeZone, instantToWall, isValidTimeZone, wallToInstant } from '@lupira/cal-domain/zonedTime';

// datetime-local <-> ISO. The inputs show the event's own wall clock — its start zone, or the browser's when it
// has none (or one the browser can't resolve).

export function eventZone(startTimezone?: string | null): string | null {
  return isValidTimeZone(startTimezone) ? startTimezone : deviceTimeZone();
}

const isBrowserZone = (zone?: string | null) => !zone || zone === deviceTimeZone();

export function isoToLocalInput(iso?: string | null, zone?: string | null): string {
  if (!iso) return '';
  if (!isBrowserZone(zone)) {
    const { day, time } = instantToWall(iso, zone!);
    return `${day}T${time}`;
  }
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(value: string, zone?: string | null): string | null {
  if (!value) return null;
  if (!isBrowserZone(zone)) {
    const [day, time] = value.split('T');
    return wallToInstant(day, time.slice(0, 5), zone!).toISOString();
  }
  return new Date(value).toISOString();
}
