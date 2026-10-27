import { haversineM, type GeoPoint } from '@danbro96/lupira-domain-places/geo';
import { MIN_PLACE_QUERY } from '@danbro96/lupira-domain-places/placeCandidates';
import type { PlaceCandidate } from '@danbro96/lupira-domain-places/placeRank';
import type { PlaceContext } from './placeContext';
import type { PlacePrediction, PredictionReason } from './placePrediction';

/** Matches domain-places' resident radius: a geocoder hit this close to a known place is that place. */
export const KNOWN_PLACE_RADIUS_M = 30;

export const PLACE_SEARCH_PROMPT = 'Search places or addresses';

export interface OmniboxAddressHit {
  displayName: string;
  latitude: number;
  longitude: number;
  osmType?: string | null;
  osmId?: number | null;
}

export type OmniboxRow =
  | {
      kind: 'place';
      placeId: string;
      label: string;
      context?: string | null;
      reasons?: PredictionReason[];
      /** The typed address resolved to this place, so it isn't offered as a new one. */
      alreadyAPlace?: OmniboxAddressHit;
    }
  | { kind: 'address'; hit: OmniboxAddressHit }
  | { kind: 'pin' };

export type OmniboxSectionKind = 'forCategory' | 'predictions' | 'homes' | 'saved' | 'frequent' | 'yours' | 'addresses' | 'pin';

export interface OmniboxSection {
  kind: OmniboxSectionKind;
  rows: OmniboxRow[];
  disabled?: 'needsConnection';
}

export interface OmniboxInput {
  query: string;
  online: boolean;
  context?: PlaceContext;
  predictions: readonly PlacePrediction[];
  /** The picker's ranked places (saved, frequent, homes, typeahead), best first. */
  ranked: readonly PlaceCandidate[];
  addressHits: readonly OmniboxAddressHit[];
  knownPoints: readonly ({ placeId: string; label: string } & GeoPoint)[];
}

const isHome = (c: PlaceCandidate) => !!c.isHome || (c.residents ?? []).some((r) => r.status === 'active');
const placeRow = (c: PlaceCandidate): OmniboxRow => ({ kind: 'place', placeId: c.placeId, label: c.label, context: c.context });

/** The picker's sections in display order; empty ones are left out, except the pin which always closes a search. */
export function omniboxSections(input: OmniboxInput): OmniboxSection[] {
  return input.query.trim().length >= MIN_PLACE_QUERY ? searchSections(input) : browseSections(input);
}

function browseSections({ context, predictions, ranked }: OmniboxInput): OmniboxSection[] {
  const shown = new Set(predictions.map((p) => p.placeId));
  const take = (match: (c: PlaceCandidate) => boolean) => ranked.filter((c) => !shown.has(c.placeId) && match(c)).map((c) => {
    shown.add(c.placeId);
    return placeRow(c);
  });
  const forCategory = context?.kind === 'event' && context.category !== 'General';
  return [
    {
      kind: forCategory ? 'forCategory' : 'predictions',
      rows: predictions.map((p): OmniboxRow => ({ kind: 'place', placeId: p.placeId, label: p.label, reasons: p.reasons })),
    },
    { kind: 'homes', rows: take(isHome) },
    { kind: 'saved', rows: take((c) => !!c.saved) },
    { kind: 'frequent', rows: take((c) => !!c.hotspot || !!c.usage) },
  ].filter((s): s is OmniboxSection => s.rows.length > 0);
}

function searchSections({ online, ranked, addressHits, knownPoints }: OmniboxInput): OmniboxSection[] {
  const yours = ranked.map(placeRow);
  const addresses: OmniboxRow[] = [];
  for (const hit of addressHits) {
    const point = { lat: hit.latitude, lon: hit.longitude };
    const known = knownPoints.find((k) => haversineM(point, k) <= KNOWN_PLACE_RADIUS_M);
    if (!known) {
      addresses.push({ kind: 'address', hit });
      continue;
    }
    const row = yours.find((r) => r.kind === 'place' && r.placeId === known.placeId);
    if (row?.kind === 'place') row.alreadyAPlace ??= hit;
    else yours.push({ kind: 'place', placeId: known.placeId, label: known.label, alreadyAPlace: hit });
  }
  const offline = online ? {} : { disabled: 'needsConnection' as const };
  return [
    ...(yours.length > 0 ? [{ kind: 'yours' as const, rows: yours }] : []),
    ...(addresses.length > 0 || !online ? [{ kind: 'addresses' as const, rows: addresses, ...offline }] : []),
    { kind: 'pin', rows: [{ kind: 'pin' }], ...offline },
  ];
}
