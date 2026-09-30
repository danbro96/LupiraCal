import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { displayTitle } from '@lupira/cal-domain/itemLabels';
import { placeSpanM } from '@lupira/cal-domain/mapZoom';
import { withResidency } from '@lupira/cal-domain/residents';
import { fmtDayShort, fmtTime, isToday } from '@lupira/cal-domain/time';
import { getDb } from '../data/db/expoDb';
import { upcomingPlacedEvents } from '../data/mirror';
import { useContactState } from './useContactList';
import { useCalendars } from './useContainers';
import { useMyContactId } from './useMe';
import { usePlaceCoords } from './usePlaceLookup';

export type QuickPlace = {
  key: string;
  kind: 'home' | 'work' | 'event';
  label: string;
  /** Null until the geo lookup resolves it — offline, or a place never geocoded. */
  point: { lat: number; lon: number } | null;
  spanM: number;
  event?: { itemId: string; title: string | null; start: string; color: string | null };
};

// Some upcoming places won't resolve to a point; asking for more keeps the strip full.
const EVENT_CANDIDATES = 10;
const EVENTS_SHOWN = 5;

/** The map's jump strip: your current home and work (your own contact card's addresses), then the next
 *  placed events. Mirror reads, so the labels are there offline; the points need the geo lookup. */
export function useQuickPlaces(nowIso: string): QuickPlace[] {
  const me = useMyContactId();
  const { data: meState } = useContactState(me ?? '');
  const { data: calendars } = useCalendars();
  const upcoming = useQuery({
    queryKey: ['items', 'upcoming-placed', nowIso],
    queryFn: async () => upcomingPlacedEvents(await getDb(), nowIso, EVENT_CANDIDATES),
  });

  const own = useMemo(() => (meState?.doc.addresses ?? [])
    .map((a) => withResidency(a))
    .filter((a) => a.status === 'active' && (a.type === 'Home' || a.type === 'Work')), [meState]);
  const placeIds = useMemo(
    () => [...own.map((a) => a.placeId), ...(upcoming.data ?? []).map((r) => r.place_id)],
    [own, upcoming.data],
  );
  const places = usePlaceCoords(placeIds);

  return useMemo(() => {
    const pointOf = (placeId: string) => {
      const p = places.get(placeId);
      return p?.latitude != null && p.longitude != null ? { lat: p.latitude, lon: p.longitude } : null;
    };
    const colorOf = (calendarId: string | null) => calendars?.find((cal) => cal.id === calendarId)?.color ?? null;
    const typeCount = (type: string) => own.filter((a) => a.type === type).length;

    const homes: QuickPlace[] = [...own]
      .sort((a, b) => (a.type === b.type ? 0 : a.type === 'Home' ? -1 : 1))
      .map((a) => {
        const name = places.get(a.placeId)?.name;
        const type = a.type === 'Home' ? 'Home' : 'Work';
        return {
          key: `${type}:${a.placeId}`,
          kind: a.type === 'Home' ? 'home' : 'work',
          label: typeCount(a.type!) > 1 && name ? `${type} · ${name}` : type,
          point: pointOf(a.placeId),
          spanM: placeSpanM(places.get(a.placeId)),
        };
      });

    // Unplaceable events are dropped rather than shown dead; a home stays even offline, it's still yours.
    const events: QuickPlace[] = (upcoming.data ?? []).flatMap((r) => {
      const point = pointOf(r.place_id);
      if (!point) return [];
      const start = new Date(r.start_utc);
      return [{
        key: `event:${r.source_id}`,
        kind: 'event' as const,
        label: `${displayTitle(r.title)} · ${isToday(start) ? fmtTime(start) : fmtDayShort(start)}`,
        point,
        spanM: placeSpanM(places.get(r.place_id)),
        event: { itemId: r.source_id, title: r.title, start: r.start_utc, color: colorOf(r.calendar_id) },
      }];
    }).slice(0, EVENTS_SHOWN);

    return [...homes, ...events];
  }, [own, upcoming.data, places, calendars]);
}
