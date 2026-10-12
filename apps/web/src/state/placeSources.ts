import type { PlaceDto, PlaceUsageDto } from '@lupira/cal-api/models';
import { withResidency, type ContactAddressRow, type HouseholdHome } from '@danbro96/lupira-domain-contacts/residents';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import { isItemCategory } from '@lupira/cal-domain/itemCategory';
import type { PlaceMeta, PredictionSources } from '@lupira/cal-domain/placePrediction';
import type { PlaceUsage } from '@lupira/cal-domain/placeUsage';

export function toPlaceUsage(rows: readonly PlaceUsageDto[]): PlaceUsage[] {
  return rows.map((u) => ({
    placeId: u.placeId,
    label: u.label ?? null,
    eventCount: u.eventCount,
    lastDay: u.lastDay,
    byCategory: u.byCategory.flatMap((c) => (isItemCategory(c.category) ? [{ category: c.category, eventCount: c.eventCount, lastDay: c.lastDay }] : [])),
    companions: u.companions,
  }));
}

/** Current Home places of the given contacts, one entry per place. */
export function currentHomes(rows: readonly ContactAddressRow[], contactIds: readonly string[], today = new Date()) {
  const wanted = new Set(contactIds);
  const byPlace = new Map<string, string[]>();
  for (const r of rows) {
    if (!wanted.has(r.contactId) || r.addressType !== 'Home' || withResidency(r, today).status !== 'active') continue;
    const there = byPlace.get(r.placeId) ?? [];
    if (!there.includes(r.contactId)) there.push(r.contactId);
    byPlace.set(r.placeId, there);
  }
  return [...byPlace].map(([placeId, ids]) => ({ placeId, contactIds: ids }));
}

export function toPlaceMeta(places: ReadonlyMap<string, PlaceDto>): Map<string, PlaceMeta> {
  return new Map([...places].map(([id, p]) => [id, { label: p.name, placeCategory: p.category, lat: p.latitude, lon: p.longitude }]));
}

export function metaPoint(meta: PlaceMeta | undefined): GeoPoint | null {
  return meta?.lat != null && meta.lon != null ? { lat: meta.lat, lon: meta.lon } : null;
}

export interface PlaceSourceInput {
  usage: readonly PlaceUsageDto[];
  rows: readonly ContactAddressRow[];
  attendeeIds: readonly string[];
  householdHomes: readonly HouseholdHome[];
  myContactId: string | null;
  saved: readonly { placeId?: string | null; label: string }[];
  hotspots: readonly { placeId?: string | null; label?: string | null; activeDays: number; lastDay: string }[];
  places: ReadonlyMap<string, PlaceDto>;
}

export function predictionSources(input: PlaceSourceInput, today = new Date()): PredictionSources {
  return {
    usage: toPlaceUsage(input.usage),
    attendeeHomes: currentHomes(input.rows, input.attendeeIds, today),
    householdHomes: input.householdHomes,
    ownHomePlaceId: input.myContactId ? currentHomes(input.rows, [input.myContactId], today)[0]?.placeId ?? null : null,
    saved: input.saved.flatMap((s) => (s.placeId ? [{ placeId: s.placeId, label: s.label }] : [])),
    hotspots: input.hotspots.flatMap((h) => (h.placeId ? [{ placeId: h.placeId, label: h.label, activeDays: h.activeDays, lastDay: h.lastDay }] : [])),
    placeMeta: toPlaceMeta(input.places),
  };
}

/** Every place id the sources mention, so one lookup can name and locate them all. */
export function sourcePlaceIds(input: Omit<PlaceSourceInput, 'places' | 'attendeeIds' | 'myContactId'>): string[] {
  return [
    ...input.usage.map((u) => u.placeId),
    ...input.rows.map((r) => r.placeId),
    ...input.householdHomes.map((h) => h.placeId),
    ...input.saved.map((s) => s.placeId),
    ...input.hotspots.map((h) => h.placeId),
  ].filter((id): id is string => !!id);
}
