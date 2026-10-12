import { describe, expect, it } from 'vitest';
import {
  EVENT_PLACE_POLICY, categoryAffinity, predictPlaces, predictionReasonText,
  type PlaceMeta, type PredictionSources,
} from './placePrediction';
import { ITEM_CATEGORIES } from './itemCategory';
import type { PlaceContext } from './placeContext';
import type { PlaceUsage } from './placeUsage';

const now = new Date(2026, 9, 12);
const GEO_PLACE_CATEGORIES = [
  'Unknown', 'Home', 'Office', 'Restaurant', 'Cafe', 'Bar', 'Store', 'Grocery', 'School', 'University', 'Clinic',
  'Hospital', 'Pharmacy', 'Gym', 'Park', 'Airport', 'Station', 'BusStop', 'Hotel', 'Landmark', 'Government', 'Worship', 'Other',
];

const meta = (entries: Record<string, PlaceMeta>) => new Map(Object.entries(entries));
const usage = (placeId: string, eventCount: number, lastDay: string, byCategory: PlaceUsage['byCategory'] = [], companions: PlaceUsage['companions'] = []): PlaceUsage =>
  ({ placeId, label: null, eventCount, lastDay, byCategory, companions });
const sources = (over: Partial<PredictionSources>): PredictionSources => ({
  usage: [], attendeeHomes: [], householdHomes: [], saved: [], hotspots: [], placeMeta: new Map(), ...over,
});
const meal = (attendeeIds: string[] = []): PlaceContext => ({ kind: 'event', category: 'Meal', attendeeIds, day: '2026-10-12' });

describe('EVENT_PLACE_POLICY', () => {
  it('covers every item category with real geo place categories', () => {
    expect(Object.keys(EVENT_PLACE_POLICY).sort()).toEqual([...ITEM_CATEGORIES].sort());
    for (const policy of Object.values(EVENT_PLACE_POLICY)) {
      for (const c of policy.placeCategories) expect(GEO_PLACE_CATEGORIES).toContain(c);
    }
  });

  it('weights matched categories over off-policy ones and homes by the policy', () => {
    const affinity = categoryAffinity(EVENT_PLACE_POLICY.Meal);
    expect(affinity('Restaurant', false)).toBeGreaterThan(affinity('Office', false));
    expect(affinity(undefined, true)).toBe(EVENT_PLACE_POLICY.Meal.homeAffinity);
    expect(categoryAffinity(EVENT_PLACE_POLICY.Appointment)(undefined, true)).toBeLessThan(affinity(undefined, true));
    expect(categoryAffinity(EVENT_PLACE_POLICY.General)('Office', false)).toBe(1);
  });
});

describe('predictPlaces for an event', () => {
  const placeMeta = meta({
    rest: { label: 'Restaurang Hörnan', placeCategory: 'Restaurant' },
    office: { label: 'Kontoret', placeCategory: 'Office' },
    anna: { label: 'Annas hus' },
    mine: { label: 'Hemma' },
  });

  it('ranks the place used for this kind of event above a busier off-policy one', () => {
    const result = predictPlaces(meal(), sources({
      placeMeta,
      usage: [
        usage('office', 40, '2026-10-01', [{ category: 'Meeting', eventCount: 40, lastDay: '2026-10-01' }]),
        usage('rest', 6, '2026-09-20', [{ category: 'Meal', eventCount: 6, lastDay: '2026-09-20' }]),
      ],
    }), now);
    expect(result[0].placeId).toBe('rest');
    expect(result[0].reasons).toContainEqual({ kind: 'usedFor', category: 'Meal', count: 6, lastDay: '2026-09-20' });
  });

  it("leads with an invited attendee's home", () => {
    const result = predictPlaces(meal(['c-anna']), sources({
      placeMeta,
      attendeeHomes: [{ placeId: 'anna', contactIds: ['c-anna', 'c-erik'] }],
      usage: [usage('rest', 6, '2026-09-20', [{ category: 'Meal', eventCount: 6, lastDay: '2026-09-20' }])],
    }), now);
    expect(result[0]).toMatchObject({ placeId: 'anna', reasons: [{ kind: 'attendeeHome', contactIds: ['c-anna'] }] });
  });

  it('skips homes of people not invited', () => {
    const result = predictPlaces(meal(['c-other']), sources({ placeMeta, attendeeHomes: [{ placeId: 'anna', contactIds: ['c-anna'] }] }), now);
    expect(result.map((p) => p.placeId)).not.toContain('anna');
  });

  it('dedupes a place known from several sources and keeps every reason', () => {
    const result = predictPlaces(meal(), sources({
      placeMeta,
      ownHomePlaceId: 'mine',
      saved: [{ placeId: 'mine', label: 'Home' }],
      usage: [usage('mine', 3, '2026-10-10')],
    }), now);
    expect(result.filter((p) => p.placeId === 'mine')).toHaveLength(1);
    expect(result[0].label).toBe('Hemma');
    expect(result[0].reasons.map((r) => r.kind)).toEqual(['ownHome', 'saved', 'recent']);
  });

  it('caps at five and keeps three when only weak candidates exist', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ placeId: `s${i}`, label: `Saved ${i}` }));
    expect(predictPlaces(meal(), sources({ saved: many }), now)).toHaveLength(5);
    const weak = Array.from({ length: 4 }, (_, i) => `h${i}`);
    const result = predictPlaces(meal(), sources({
      householdHomes: weak.map((placeId) => ({ placeId, contacts: [] })),
      placeMeta: meta(Object.fromEntries(weak.map((id) => [id, { label: id }]))),
    }), now);
    expect(result).toHaveLength(3);
  });

  it('marks places near the event origin', () => {
    const ctx: PlaceContext = { kind: 'event', category: 'Meal', attendeeIds: [], day: '2026-10-12', origin: { lat: 56.83, lon: 13.94 } };
    const result = predictPlaces(ctx, sources({
      saved: [{ placeId: 'rest', label: 'x' }],
      placeMeta: meta({ rest: { label: 'Hörnan', lat: 56.831, lon: 13.941 } }),
    }), now);
    expect(result[0].reasons).toContainEqual({ kind: 'nearby' });
  });
});

describe('predictPlaces for a residency', () => {
  it('offers household homes, members of the household first, then recent addresses', () => {
    const result = predictPlaces(
      { kind: 'residency', contactId: 'kid', householdContactIds: ['dad'] },
      sources({
        householdHomes: [
          { placeId: 'gran', contacts: [{ contactId: 'gran', displayName: 'Gran', relation: 'Parent' }] },
          { placeId: 'dads', contacts: [{ contactId: 'dad', displayName: 'Dad', relation: 'Parent' }] },
        ],
        recentResidencies: [{ placeId: 'new', lastDay: '2026-10-01' }, { placeId: 'dads', lastDay: '2026-09-01' }],
        placeMeta: meta({ gran: { label: 'Grans' }, dads: { label: 'Dads' }, new: { label: 'Nybygget' } }),
      }),
      now,
    );
    expect(result.map((p) => p.placeId)).toEqual(['dads', 'gran', 'new']);
    expect(result[0].reasons).toEqual([{ kind: 'householdHome', contactId: 'dad', relation: 'Parent' }]);
  });
});

describe('predictionReasonText', () => {
  const nameOf = (id: string) => ({ a: 'Anna', e: 'Erik', o: 'Olle' })[id] ?? id;

  it('reads each reason in a few words', () => {
    expect(predictionReasonText({ kind: 'usedFor', category: 'Meal', count: 3, lastDay: '2026-01-01' }, nameOf)).toBe('3 meals here');
    expect(predictionReasonText({ kind: 'usedFor', category: 'Activity', count: 1, lastDay: '2026-01-01' }, nameOf)).toBe('1 activity here');
    expect(predictionReasonText({ kind: 'attendeeHome', contactIds: ['a'] }, nameOf)).toBe("Anna's home");
    expect(predictionReasonText({ kind: 'attendeeHome', contactIds: ['a', 'e', 'o'] }, nameOf)).toBe('Home of Anna, Erik and Olle');
    expect(predictionReasonText({ kind: 'householdHome', contactId: 'e', relation: 'Sibling' }, nameOf)).toBe("Erik's home");
    expect(predictionReasonText({ kind: 'ownHome' }, nameOf)).toBe('Your home');
    expect(predictionReasonText({ kind: 'frequent', activeDays: 12 }, nameOf)).toBe('Visited 12 days');
    expect(predictionReasonText({ kind: 'saved' }, nameOf)).toBe('Saved');
    expect(predictionReasonText({ kind: 'recent', lastDay: '2026-10-01' }, nameOf)).toMatch(/^Last here /);
    expect(predictionReasonText({ kind: 'nearby' }, nameOf)).toBe('Nearby');
  });
});
