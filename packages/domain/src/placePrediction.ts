import { haversineM } from '@danbro96/lupira-domain-places/geo';
import { placeScore, rankPlaces, type PlaceCandidate, type PlaceRankContext } from '@danbro96/lupira-domain-places/placeRank';
import type { HouseholdHome } from '@danbro96/lupira-domain-contacts/residents';
import { fmtDate, parseYmd } from '@danbro96/lupira-domain-core/time';
import { plural } from '@danbro96/lupira-domain-core/wording';
import type { ItemCategory } from './itemCategory';
import type { PlaceContext } from './placeContext';
import type { PlaceUsage } from './placeUsage';

export type PredictionReason =
  | { kind: 'usedFor'; category: ItemCategory; count: number; lastDay: string }
  | { kind: 'attendeeHome'; contactIds: string[] }
  | { kind: 'householdHome'; contactId: string; relation: string }
  | { kind: 'ownHome' }
  | { kind: 'frequent'; activeDays: number }
  | { kind: 'saved' }
  | { kind: 'recent'; lastDay: string }
  | { kind: 'nearby' };

export interface PlacePrediction {
  placeId: string;
  label: string;
  reasons: PredictionReason[];
  score: number;
}

export interface EventPlacePolicy {
  /** cal-api/geo-api PlaceCategory names that suit the event; empty = every category alike. */
  placeCategories: string[];
  /** Weight of past use of a home for this kind of event. */
  homeAffinity: number;
  /** 0..1 — favour where you went last over where you go most. */
  recencyBias: number;
}

export const EVENT_PLACE_POLICY: Record<ItemCategory, EventPlacePolicy> = {
  General: { placeCategories: [], homeAffinity: 1, recencyBias: 0 },
  Meeting: { placeCategories: ['Office'], homeAffinity: 0.5, recencyBias: 0.3 },
  Appointment: { placeCategories: ['Clinic', 'Hospital', 'Government'], homeAffinity: 0.2, recencyBias: 0.8 },
  Meal: { placeCategories: ['Restaurant', 'Cafe', 'Bar'], homeAffinity: 1.5, recencyBias: 0.2 },
  Occasion: { placeCategories: ['Restaurant', 'Worship', 'Landmark'], homeAffinity: 1.5, recencyBias: 0.2 },
  Outing: { placeCategories: ['Gym', 'Park'], homeAffinity: 1, recencyBias: 0.3 },
  Trip: { placeCategories: ['Hotel', 'Airport', 'Station'], homeAffinity: 1, recencyBias: 0.2 },
  Stay: { placeCategories: ['Hotel', 'Airport', 'Station'], homeAffinity: 1, recencyBias: 0.2 },
  Activity: { placeCategories: ['Gym', 'Park'], homeAffinity: 1, recencyBias: 0.3 },
  Focus: { placeCategories: ['Office', 'University', 'School', 'Cafe'], homeAffinity: 1, recencyBias: 0.3 },
  Chore: { placeCategories: ['Store', 'Grocery', 'Pharmacy'], homeAffinity: 0.5, recencyBias: 0.3 },
};

const MATCHED_CATEGORY = 1.5;
const OFF_POLICY = 0.3;

export function categoryAffinity(policy: EventPlacePolicy): NonNullable<PlaceRankContext['categoryAffinity']> {
  return (placeCategory, isHome) => {
    if (isHome) return policy.homeAffinity;
    if (policy.placeCategories.length === 0) return 1;
    return placeCategory && policy.placeCategories.includes(placeCategory) ? MATCHED_CATEGORY : OFF_POLICY;
  };
}

export interface PlaceMeta {
  label: string;
  placeCategory?: string | null;
  lat?: number | null;
  lon?: number | null;
}

export interface PredictionSources {
  usage: readonly PlaceUsage[];
  /** Current homes of the event's attendees. */
  attendeeHomes: readonly { placeId: string; contactIds: readonly string[] }[];
  householdHomes: readonly HouseholdHome[];
  ownHomePlaceId?: string | null;
  saved: readonly { placeId: string; label: string }[];
  hotspots: readonly { placeId: string; label?: string | null; activeDays: number; lastDay: string }[];
  placeMeta: ReadonlyMap<string, PlaceMeta>;
  /** Places recently given as someone's address, newest first. */
  recentResidencies?: readonly { placeId: string; lastDay: string }[];
}

export const PREDICTION_MAX = 5;
export const PREDICTION_MIN = 3;
/** Below this a candidate is only a filler for the minimum: text match 1 plus half a point of signal. */
const PREDICTION_FLOOR = 1.5;
const RECENT_DAYS = 30;
const NEARBY_M = 2_000;
const DAY_MS = 86_400_000;

export function predictPlaces(ctx: PlaceContext, sources: PredictionSources, now: Date = new Date()): PlacePrediction[] {
  return ctx.kind === 'residency' ? predictResidency(ctx, sources) : predictRanked(ctx, sources, now);
}

function predictRanked(ctx: Exclude<PlaceContext, { kind: 'residency' }>, sources: PredictionSources, now: Date): PlacePrediction[] {
  const event = ctx.kind === 'event' ? ctx : null;
  const origin = ctx.kind === 'event' ? ctx.origin : ctx.near;
  const attendees = new Set(event?.attendeeIds ?? []);
  const policy = event ? EVENT_PLACE_POLICY[event.category] : null;
  const homes = new Set([
    ...(sources.ownHomePlaceId ? [sources.ownHomePlaceId] : []),
    ...sources.householdHomes.map((h) => h.placeId),
    ...sources.attendeeHomes.map((h) => h.placeId),
  ]);
  const reasons = new Map<string, PredictionReason[]>();
  const because = (placeId: string, reason: PredictionReason) => reasons.set(placeId, [...(reasons.get(placeId) ?? []), reason]);
  const labels = new Map<string, string>();
  const known = (placeId: string, label: string | null | undefined): PlaceCandidate => {
    const meta = sources.placeMeta.get(placeId);
    const name = meta?.label || label || labels.get(placeId) || '';
    labels.set(placeId, name);
    return {
      placeId,
      label: name,
      placeCategory: meta?.placeCategory ?? undefined,
      point: meta?.lat != null && meta.lon != null ? { lat: meta.lat, lon: meta.lon } : null,
      isHome: homes.has(placeId),
    };
  };

  const candidates: PlaceCandidate[] = [];
  for (const u of sources.usage) {
    const forKind = event ? u.byCategory.find((c) => c.category === event.category) : undefined;
    candidates.push({
      ...known(u.placeId, u.label),
      usage: { count: u.eventCount, lastDay: u.lastDay, categoryCount: forKind?.eventCount, categoryLastDay: forKind?.lastDay },
      companions: u.companions.map((c) => ({ contactId: c.contactId, count: c.eventCount })),
    });
    if (forKind && event) because(u.placeId, { kind: 'usedFor', category: event.category, count: forKind.eventCount, lastDay: forKind.lastDay });
  }
  for (const h of sources.attendeeHomes) {
    const there = h.contactIds.filter((id) => attendees.has(id));
    if (there.length === 0) continue;
    candidates.push({ ...known(h.placeId, null), residents: there.map((contactId) => ({ contactId, status: 'active' })) });
    because(h.placeId, { kind: 'attendeeHome', contactIds: there });
  }
  for (const h of sources.householdHomes) {
    candidates.push(known(h.placeId, null));
    for (const c of h.contacts) because(h.placeId, { kind: 'householdHome', contactId: c.contactId, relation: c.relation });
  }
  if (sources.ownHomePlaceId) {
    candidates.push(known(sources.ownHomePlaceId, null));
    because(sources.ownHomePlaceId, { kind: 'ownHome' });
  }
  for (const h of sources.hotspots) {
    candidates.push({ ...known(h.placeId, h.label), hotspot: { activeDays: h.activeDays, lastDay: h.lastDay } });
    because(h.placeId, { kind: 'frequent', activeDays: h.activeDays });
  }
  for (const s of sources.saved) {
    candidates.push({ ...known(s.placeId, s.label), saved: true });
    because(s.placeId, { kind: 'saved' });
  }
  for (const u of sources.usage) {
    if ((now.getTime() - parseYmd(u.lastDay).getTime()) / DAY_MS <= RECENT_DAYS) because(u.placeId, { kind: 'recent', lastDay: u.lastDay });
  }

  const rankCtx: PlaceRankContext = {
    query: '',
    now,
    attendeeIds: attendees,
    origin: origin ?? null,
    categoryAffinity: policy ? categoryAffinity(policy) : undefined,
    recencyBias: policy?.recencyBias,
  };
  const scored = rankPlaces(candidates.filter((c) => c.label), rankCtx).map((c) => {
    const near = origin && c.point && haversineM(origin, c.point) <= NEARBY_M;
    return {
      placeId: c.placeId,
      label: c.label,
      reasons: [...(reasons.get(c.placeId) ?? []), ...(near ? [{ kind: 'nearby' } as const] : [])],
      score: placeScore(c, rankCtx),
    };
  });
  return capPredictions(scored);
}

function capPredictions(scored: readonly PlacePrediction[]): PlacePrediction[] {
  const strong = scored.filter((p) => p.score >= PREDICTION_FLOOR).length;
  return scored.slice(0, Math.min(PREDICTION_MAX, Math.max(PREDICTION_MIN, strong)));
}

function predictResidency(ctx: Extract<PlaceContext, { kind: 'residency' }>, sources: PredictionSources): PlacePrediction[] {
  const household = new Set(ctx.householdContactIds);
  const label = (placeId: string) => sources.placeMeta.get(placeId)?.label ?? '';
  const homes = sources.householdHomes
    .map((h) => ({
      placeId: h.placeId,
      label: label(h.placeId),
      reasons: h.contacts.map((c): PredictionReason => ({ kind: 'householdHome', contactId: c.contactId, relation: c.relation })),
      score: h.contacts.filter((c) => household.has(c.contactId)).length * 2 + h.contacts.length,
    }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const recent = (sources.recentResidencies ?? []).map((r, i) => ({
    placeId: r.placeId,
    label: label(r.placeId),
    reasons: [{ kind: 'recent', lastDay: r.lastDay } as const],
    score: 1 / (i + 2),
  }));
  const byPlace = new Map<string, PlacePrediction>();
  for (const p of [...homes, ...recent]) if (p.label && !byPlace.has(p.placeId)) byPlace.set(p.placeId, p);
  return [...byPlace.values()].slice(0, PREDICTION_MAX);
}

const CATEGORY_NOUNS: Record<ItemCategory, [string, string]> = {
  General: ['event', 'events'],
  Meeting: ['meeting', 'meetings'],
  Appointment: ['appointment', 'appointments'],
  Meal: ['meal', 'meals'],
  Occasion: ['occasion', 'occasions'],
  Outing: ['outing', 'outings'],
  Trip: ['trip', 'trips'],
  Stay: ['stay', 'stays'],
  Activity: ['activity', 'activities'],
  Focus: ['focus session', 'focus sessions'],
  Chore: ['errand', 'errands'],
};

/** Why a place is offered, in a few words; `nameOf` resolves contact ids to display names. */
export function predictionReasonText(reason: PredictionReason, nameOf: (contactId: string) => string): string {
  switch (reason.kind) {
    case 'usedFor': {
      const [one, many] = CATEGORY_NOUNS[reason.category];
      return `${plural(reason.count, one, many)} here`;
    }
    case 'attendeeHome': {
      const names = reason.contactIds.map(nameOf);
      return names.length === 1 ? `${names[0]}'s home` : `Home of ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    }
    case 'householdHome':
      return `${nameOf(reason.contactId)}'s home`;
    case 'ownHome':
      return 'Your home';
    case 'frequent':
      return `Visited ${plural(reason.activeDays, 'day')}`;
    case 'saved':
      return 'Saved';
    case 'recent':
      return `Last here ${fmtDate(parseYmd(reason.lastDay))}`;
    case 'nearby':
      return 'Nearby';
  }
}
