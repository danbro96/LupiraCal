import { isoToWall, wallToIso } from '@lupira/cal-domain/zonedTime';

// datetime-local <-> ISO. The inputs show the event's own wall clock (`eventZone`).

export function isoToLocalInput(iso?: string | null, zone?: string | null): string {
  if (!iso) return '';
  const { day, time } = isoToWall(iso, zone);
  return `${day}T${time}`;
}

export function localInputToIso(value: string, zone?: string | null): string | null {
  if (!value) return null;
  const [day, time] = value.split('T');
  return wallToIso(day, time.slice(0, 5), zone);
}
