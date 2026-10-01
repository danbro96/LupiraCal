import { useMemo } from 'react';
import { useSearchItems } from '@lupira/cal-api/query/cal';
import { useGetContact } from '@lupira/cal-api/query/contact';
import { nextPlacedEvents, quickPlaces, type QuickPlace } from '@lupira/cal-domain/quickPlaces';
import { addDays } from '@lupira/cal-domain/time';
import { calendarColor } from '@lupira/cal-tokens/kinds';
import { useContainers } from './useContainers';
import { useMyContactId } from './useMe';
import { usePlaceCoords } from './usePlaceLookup';

const LOOKAHEAD_DAYS = 60;

/** The map's jump strip (`@lupira/cal-domain/quickPlaces`): your own contact card's current home and work,
 *  then the next placed events. */
export function useQuickPlaces(nowIso: string): QuickPlace[] {
  const me = useMyContactId();
  const { data: contact } = useGetContact(me ?? '', { query: { enabled: !!me } });
  const { calendars } = useContainers();
  const { data: occurrences } = useSearchItems({ from: nowIso, to: addDays(new Date(nowIso), LOOKAHEAD_DAYS).toISOString() });

  const ownAddresses = useMemo(() => contact?.addresses ?? [], [contact]);
  const upcoming = useMemo(() => nextPlacedEvents(occurrences ?? [], new Date(nowIso)), [occurrences, nowIso]);
  const { places } = usePlaceCoords(useMemo(
    () => [...ownAddresses.map((a) => a.placeId), ...upcoming.map((o) => o.placeId)],
    [ownAddresses, upcoming],
  ));

  return useMemo(() => quickPlaces({
    ownAddresses,
    places,
    upcoming: upcoming.map((o) => {
      const calendar = calendars.find((c) => o.calendarIds.includes(c.id));
      return { itemId: o.id, title: o.title ?? null, start: o.start, placeId: o.placeId!, color: calendar ? calendarColor(calendar) : null };
    }),
  }), [ownAddresses, places, upcoming, calendars]);
}
