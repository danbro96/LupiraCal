import { useGetPlaceUsage, useSearchItems } from '@lupira/cal-api/query/cal';
import { useListContactRelations } from '@lupira/cal-api/query/contact';
import { useListSavedPlaces } from '@lupira/cal-api/query/geo';
import { householdHomes } from '@danbro96/lupira-domain-contacts/residents';
import { dayEndIso, dayStartIso } from '@danbro96/lupira-domain-core/time';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import { eventOrigin } from '@danbro96/lupira-domain-places/placeCandidates';
import type { PlaceContext } from '@lupira/cal-domain/placeContext';
import { recentResidencies } from '@lupira/cal-domain/placePrediction';
import { metaPoint, predictionSources, sourcePlaceIds } from './placeSources';
import { useHotspots } from './useHotspots';
import { useMyContactId } from './useMe';
import { usePlaceCoords } from './usePlaceLookup';
import { useResidencyRows } from './useResidencies';

const USAGE_STALE_MS = 10 * 60_000;

/** What the app knows about places for one picking context: usage, homes, saved, frequent, each named and located
 *  by one lookup. An event without an origin is placed by its day's other events, else by your home. */
export function usePlaceSources(ctx: PlaceContext, enabled = true) {
  const me = useMyContactId();
  const forEvents = enabled && ctx.kind !== 'residency';
  const { rows } = useResidencyRows(enabled);
  const { data: usage } = useGetPlaceUsage(undefined, { query: { enabled: forEvents, staleTime: USAGE_STALE_MS } });
  const { data: saved } = useListSavedPlaces({ query: { enabled } });
  const { data: hotspots } = useHotspots(forEvents);
  const householdOf = ctx.kind === 'residency' ? ctx.contactId : me;
  const { data: relations } = useListContactRelations(householdOf ?? '', undefined, { query: { enabled: enabled && !!householdOf } });
  const day = ctx.kind === 'event' && !ctx.origin ? ctx.day : null;
  const { data: dayEvents } = useSearchItems(day ? { from: dayStartIso(day), to: dayEndIso(day) } : undefined, {
    query: { enabled: enabled && !!day },
  });

  const ownPlaces = new Set(ctx.kind === 'residency' ? rows.filter((r) => r.contactId === ctx.contactId).map((r) => r.placeId) : []);
  const household = householdOf
    ? householdHomes(householdOf, relations ?? [], rows).filter((h) => !ownPlaces.has(h.placeId))
    : [];
  const base = { usage: usage ?? [], rows, householdHomes: household, saved: saved ?? [], hotspots: hotspots ?? [] };
  const dayPlaceIds = (dayEvents ?? []).flatMap((o) => (o.placeId ? [o.placeId] : []));
  const { places, isLoading } = usePlaceCoords([...sourcePlaceIds(base), ...dayPlaceIds]);
  const attendeeIds = ctx.kind === 'event' ? ctx.attendeeIds : [];
  const sources = {
    ...predictionSources({ ...base, attendeeIds, myContactId: me, places }),
    ...(ctx.kind === 'residency' ? { recentResidencies: recentResidencies(rows, ctx.contactId, household.map((h) => h.placeId)) } : {}),
  };

  const ownHome = metaPoint(sources.placeMeta.get(sources.ownHomePlaceId ?? ''));
  const dayPlaces = dayPlaceIds.flatMap((id) => places.get(id) ?? []);
  const origin: GeoPoint | null = ctx.kind === 'event'
    ? ctx.origin ?? eventOrigin(dayPlaces, ownHome)
    : ctx.kind === 'free' ? ctx.near ?? ownHome : ownHome;
  const context: PlaceContext = ctx.kind === 'event' ? { ...ctx, origin: origin ?? undefined } : ctx;

  const names = new Map(rows.map((r) => [r.contactId, r.displayName]));
  for (const h of household) for (const c of h.contacts) names.set(c.contactId, c.displayName);
  const nameOf = (contactId: string) => names.get(contactId) ?? 'Someone';

  return { context, sources, origin, nameOf, rows, places, saved: saved ?? [], hotspots: hotspots ?? [], isLoading };
}
