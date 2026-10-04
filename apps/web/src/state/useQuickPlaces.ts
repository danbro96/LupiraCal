import { useMemo } from 'react';
import { useSearchItems } from '@lupira/cal-api/query/cal';
import { nextPlacedEvents, quickPlaces, type QuickPlace } from '@lupira/cal-domain/quickPlaces';
import { addDays } from '@danbro96/lupira-domain-core/time';
import { calendarColor } from '@danbro96/lupira-tokens-calendar/kinds';
import { useContainers } from './useContainers';
import { useMyContactId } from './useMe';
import { usePlaceCoords } from './usePlaceLookup';
import { useParentsHomes, useResidencyRows } from './useResidencies';

const LOOKAHEAD_DAYS = 60;

/** The map's jump strip (`@lupira/cal-domain/quickPlaces`): your current home and work, your parents' home, then the
 *  next placed events. */
export function useQuickPlaces(nowIso: string): QuickPlace[] {
  const me = useMyContactId();
  const { rows } = useResidencyRows();
  const parents = useParentsHomes(me, rows);
  const { calendars } = useContainers();
  const { data: occurrences } = useSearchItems({ from: nowIso, to: addDays(new Date(nowIso), LOOKAHEAD_DAYS).toISOString() });

  const ownAddresses = useMemo(() => rows.filter((r) => r.contactId === me).map((r) => ({ ...r, type: r.addressType })), [rows, me]);
  const upcoming = useMemo(() => nextPlacedEvents(occurrences ?? [], new Date(nowIso)), [occurrences, nowIso]);
  const { places } = usePlaceCoords(
    [...ownAddresses.map((a) => a.placeId), ...parents.map((p) => p.placeId), ...upcoming.map((o) => o.placeId)],
  );

  return quickPlaces({
    ownAddresses,
    parents,
    places,
    upcoming: upcoming.map((o) => {
      const calendar = calendars.find((c) => o.calendarIds.includes(c.id));
      return { itemId: o.id, title: o.title ?? null, start: o.start, placeId: o.placeId!, color: calendar ? calendarColor(calendar) : null };
    }),
  });
}
