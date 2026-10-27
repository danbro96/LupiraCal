import { getHotspots } from '@lupira/cal-api/fetch/cal';
import { listSavedPlaces } from '@lupira/cal-api/fetch/geo';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { useQuery } from '@tanstack/react-query';
import { withResidency, householdHomes, type ContactAddressRow } from '@danbro96/lupira-domain-contacts/residents';
import { ymd } from '@danbro96/lupira-domain-core/time';
import { eventOrigin } from '@danbro96/lupira-domain-places/placeCandidates';
import { isItemCategory } from '@lupira/cal-domain/itemCategory';
import type { PlaceContext } from '@lupira/cal-domain/placeContext';
import { hotspotWindowFrom, predictPlaces, recentResidencies, type PlaceMeta, type PlacePrediction } from '@lupira/cal-domain/placePrediction';
import { placedEventsBetween } from '../data/queries/places';
import { placeUsageUpTo } from '../data/queries/placeUsage';
import { Aggregate } from '../domain/aggregates';
import { readyDb } from '../sync/engine';
import { useContactRelations } from './useContactList';
import { useMyContactId } from './useMe';
import { usePlaceCoords } from './usePlaceLookup';
import { useResidencyRows } from './useResidencies';

export function useSavedPlaces() {
  return useQuery(onlineQuery(['map', 'saved-places'], () => listSavedPlaces())).data ?? [];
}

export function useHotspots() {
  const from = hotspotWindowFrom(new Date());
  return useQuery(onlineQuery(['map', 'hotspots', from], () => getHotspots({ from }))).data ?? [];
}

/** An event's place context; its origin is the middle of the day's other placed events. */
export function useEventPlaceContext({ category, attendeeIds, day }: { category: string; attendeeIds: string[]; day: string | null }): PlaceContext {
  const dayEvents = useQuery({
    ...mirrorQuery([Aggregate.item, 'places-on', day], async () => placedEventsBetween(await readyDb(), day!, day!)),
    enabled: !!day,
  });
  const dayPlaces = usePlaceCoords((dayEvents.data ?? []).map((r) => r.place_id));
  const origin = eventOrigin(dayPlaces.values(), null);
  return {
    kind: 'event',
    category: isItemCategory(category) ? category : 'General',
    attendeeIds,
    day: day ?? ymd(new Date()),
    ...(origin ? { origin } : {}),
  };
}

/** The few places the context most likely means. Usage, homes and households come from the mirror; saved places,
 *  hotspots and coordinates from the persisted online cache, so predictions hold up offline. */
export function usePlacePredictions(ctx: PlaceContext): PlacePrediction[] {
  const today = ymd(new Date());
  const usage = useQuery({
    ...mirrorQuery([Aggregate.item, 'place-usage', today], async () => placeUsageUpTo(await readyDb(), today)),
    enabled: ctx.kind !== 'residency',
  });
  const rows = useResidencyRows();
  const me = useMyContactId();
  const householdOf = ctx.kind === 'residency' ? ctx.contactId : me;
  const { data: relations } = useContactRelations(householdOf ?? '');
  const saved = useSavedPlaces();
  const hotspots = useHotspots();

  const current = rows.filter((r) => r.addressType === 'Home' && withResidency(r).status === 'active');
  const attendees = new Set(ctx.kind === 'event' ? ctx.attendeeIds : []);
  const attendeeHomes = groupByPlace(current.filter((r) => attendees.has(r.contactId) && r.contactId !== me));
  const homes = householdOf
    ? householdHomes(householdOf, (relations ?? []).map((r) => ({ contactId: r.otherId, displayName: r.displayName, kind: r.kind, ended: r.ended })), rows)
    : [];
  const ownHomePlaceId = ctx.kind === 'residency' ? null : current.find((r) => r.contactId === me)?.placeId ?? null;
  const savedPlaces = saved.flatMap((s) => (s.placeId ? [{ placeId: s.placeId, label: s.label }] : []));
  const spots = hotspots.flatMap((h) => (h.placeId ? [{ placeId: h.placeId, label: h.label, activeDays: h.activeDays, lastDay: h.lastDay }] : []));
  const recent = ctx.kind === 'residency' ? recentResidencies(rows, ctx.contactId, homes.map((h) => h.placeId)) : [];

  const coords = usePlaceCoords([
    ...(usage.data ?? []).map((u) => u.placeId), ...attendeeHomes.map((h) => h.placeId), ...homes.map((h) => h.placeId),
    ownHomePlaceId, ...savedPlaces.map((s) => s.placeId), ...spots.map((s) => s.placeId), ...recent.map((r) => r.placeId),
  ]);
  const placeMeta = new Map<string, PlaceMeta>([...coords].map(([id, p]) => [id, { label: p.name, placeCategory: p.category, lat: p.latitude, lon: p.longitude }]));

  return predictPlaces(ctx, {
    usage: usage.data ?? [], attendeeHomes, householdHomes: homes, ownHomePlaceId, saved: savedPlaces, hotspots: spots, placeMeta,
    recentResidencies: recent,
  });
}

function groupByPlace(rows: readonly ContactAddressRow[]): { placeId: string; contactIds: string[] }[] {
  const byPlace = new Map<string, string[]>();
  for (const r of rows) byPlace.set(r.placeId, [...(byPlace.get(r.placeId) ?? []), r.contactId]);
  return [...byPlace].map(([placeId, contactIds]) => ({ placeId, contactIds }));
}
