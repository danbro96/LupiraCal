// The place picker's whole list, from the raw sources both apps fetch: saved places, hotspots, the server's
// typeahead and contacts' addresses. Folds them into candidates, ranks them (placeRank) and says who lives
// at each. Inputs are structural, so each app passes its own DTOs or mirror rows straight in.

import { haversineM, type GeoPoint } from './geo';
import { hotspotStats } from './mapFeatures';
import { rankPlaces, type PlaceCandidate } from './placeRank';
import { otherResidentsLine, residentsByPlace, residentsLine, withResidency, type ContactAddressRow } from './residents';
import { matchesTerms, searchTerms } from './textSearch';

export const MIN_PLACE_QUERY = 2;
const CANDIDATE_HOTSPOTS = 30;
const SHOWN_LIMIT = 15;
/** A geocoder hit this close to a resident's place is taken to be that address. */
const RESIDENT_RADIUS_M = 30;

export interface PlaceInfo {
  name?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface PlacePickerInput {
  query: string;
  now: Date;
  saved: readonly { placeId?: string | null; label: string; latitude?: number | null; longitude?: number | null }[];
  hotspots: readonly {
    placeId?: string | null; label?: string | null; latitude: number; longitude: number;
    activeDays: number; eventCount: number; photoCount: number; lastDay: string;
  }[];
  /** The server's typeahead, best first, places only (a locality is not somewhere an event can be). */
  suggestions: readonly { id: string; name: string; context?: string | null; latitude?: number | null; longitude?: number | null }[];
  addresses: readonly ContactAddressRow[];
  /** Resolved places for the contact addresses. */
  places: ReadonlyMap<string, PlaceInfo>;
  attendeeIds: readonly string[];
  contactScores?: ReadonlyMap<string, number>;
  origin?: GeoPoint | null;
}

export type PickerPlace = PlaceCandidate & {
  /** "Anna lives here". */
  residentsLine: string | null;
  /** "Anna lived here 2010–2015" — muted, and only where nobody lives now. */
  otherLine: string | null;
};

const pointOf = (lat?: number | null, lon?: number | null): GeoPoint | null => (lat != null && lon != null ? { lat, lon } : null);

/** Ranked places for the picker, plus a lookup for addresses that aren't places yet (geocoder hits). Before
 *  typing: saved, frequent and invited people's homes. Typing: the typeahead, whatever of those matches, and
 *  the addresses of contacts whose name matches. */
export function pickPlaces(input: PlacePickerInput): { places: PickerPlace[]; residentsNear: (point: GeoPoint) => string | null } {
  const { now, places } = input;
  const q = input.query.trim();
  const typing = q.length >= MIN_PLACE_QUERY;
  const residents = residentsByPlace(input.addresses, now);
  const residentsOf = (placeId: string) => {
    const r = residents.get(placeId);
    return r ? [...r.active, ...r.other].map((x) => ({ contactId: x.contactId, status: x.status })) : undefined;
  };
  const attendees = new Set(input.attendeeIds);
  const terms = searchTerms(q);

  const candidates: PlaceCandidate[] = [
    ...input.saved.flatMap((p) => (p.placeId
      ? [{ placeId: p.placeId, label: p.label, saved: true, point: pointOf(p.latitude, p.longitude) }]
      : [])),
    ...input.hotspots.slice(0, CANDIDATE_HOTSPOTS).flatMap((h) => (h.placeId && h.label
      ? [{
          placeId: h.placeId, label: h.label, context: hotspotStats(h),
          hotspot: { activeDays: h.activeDays, lastDay: h.lastDay }, point: pointOf(h.latitude, h.longitude),
        }]
      : [])),
    ...(typing ? input.suggestions : []).map((s, i) => ({
      placeId: s.id, label: s.name, context: s.context, suggestRank: i, point: pointOf(s.latitude, s.longitude),
    })),
    ...input.addresses.flatMap((r) => {
      const named = typing && matchesTerms(terms, r.displayName);
      const invited = !typing && attendees.has(r.contactId);
      if (!named && !invited) return [];
      const status = withResidency(r, now).status;
      if (invited && status !== 'active') return [];
      const place = places.get(r.placeId);
      return [{
        placeId: r.placeId,
        label: place?.name ?? `${r.displayName}'s ${(r.addressType ?? 'address').toLowerCase()}`,
        context: place?.formattedAddress,
        viaContact: named ? { contactId: r.contactId, status } : undefined,
        point: pointOf(place?.latitude, place?.longitude),
      }];
    }),
  ].map((c) => ({ ...c, residents: residentsOf(c.placeId) }));

  const ranked = rankPlaces(candidates, {
    query: q, now, attendeeIds: attendees, contactScores: input.contactScores, origin: input.origin,
  }).slice(0, SHOWN_LIMIT);

  return {
    places: ranked.map((c) => ({
      ...c,
      residentsLine: residentsLine(residents.get(c.placeId)),
      otherLine: otherResidentsLine(residents.get(c.placeId)),
    })),
    residentsNear: (point) => {
      for (const [placeId, r] of residents) {
        const p = places.get(placeId);
        if (r.active.length > 0 && p?.latitude != null && p.longitude != null
          && haversineM(point, { lat: p.latitude, lon: p.longitude }) <= RESIDENT_RADIUS_M) return residentsLine(r);
      }
      return null;
    },
  };
}

/** Where the event probably is: the middle of the day's other placed events, else the fallback (you). */
export function eventOrigin(dayPlaces: Iterable<PlaceInfo>, fallback: GeoPoint | null): GeoPoint | null {
  const located = [...dayPlaces].filter((p) => p.latitude != null && p.longitude != null);
  if (located.length === 0) return fallback;
  return {
    lat: located.reduce((n, p) => n + p.latitude!, 0) / located.length,
    lon: located.reduce((n, p) => n + p.longitude!, 0) / located.length,
  };
}
