import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QUICK_EVENT_CANDIDATES, quickPlaces, type QuickPlace } from '@lupira/cal-domain/quickPlaces';
import { getDb } from '../data/db/expoDb';
import { upcomingPlacedEvents } from '../data/mirror';
import { useCalendarFilter, useCalendars } from './useContainers';
import { useMyContactId } from './useMe';
import { usePlaceCoords } from './usePlaceLookup';
import { useParentsHomes, useResidencyRows } from './useResidencies';

/** The map's jump strip (`@lupira/cal-domain/quickPlaces`) from mirror reads: your own residencies, your parents'
 *  home and the next placed events. The labels work offline; the points need the geo lookup. */
export function useQuickPlaces(nowIso: string): QuickPlace[] {
  const me = useMyContactId();
  const rows = useResidencyRows();
  const parents = useParentsHomes(me, rows);
  const { data: calendars } = useCalendars();
  const filter = useCalendarFilter();
  const upcoming = useQuery({
    queryKey: ['items', 'upcoming-placed', nowIso, filter],
    enabled: filter !== null,
    queryFn: async () => upcomingPlacedEvents(await getDb(), nowIso, QUICK_EVENT_CANDIDATES, filter!),
  });

  const ownAddresses = useMemo(() => rows.filter((r) => r.contactId === me).map((r) => ({ ...r, type: r.addressType })), [rows, me]);
  const placeIds = useMemo(
    () => [...ownAddresses.map((a) => a.placeId), ...parents.map((p) => p.placeId), ...(upcoming.data ?? []).map((r) => r.place_id)],
    [ownAddresses, parents, upcoming.data],
  );
  const places = usePlaceCoords(placeIds);

  return useMemo(() => quickPlaces({
    ownAddresses,
    parents,
    places,
    upcoming: (upcoming.data ?? []).map((r) => ({
      itemId: r.source_id,
      title: r.title,
      start: r.start_utc,
      placeId: r.place_id,
      color: calendars?.find((cal) => cal.id === r.calendar_id)?.color ?? null,
    })),
  }), [ownAddresses, parents, places, upcoming.data, calendars]);
}
