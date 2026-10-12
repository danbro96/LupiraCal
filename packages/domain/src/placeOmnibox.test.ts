import { describe, expect, it } from 'vitest';
import type { PlaceCandidate } from '@danbro96/lupira-domain-places/placeRank';
import { omniboxSections, type OmniboxAddressHit, type OmniboxInput } from './placeOmnibox';

const input = (over: Partial<OmniboxInput>): OmniboxInput => ({
  query: '', online: true, predictions: [], ranked: [], addressHits: [], knownPoints: [], ...over,
});
const place = (placeId: string, extra: Partial<PlaceCandidate> = {}): PlaceCandidate => ({ placeId, label: placeId, ...extra });
const hit = (displayName: string, latitude: number, longitude: number): OmniboxAddressHit => ({ displayName, latitude, longitude });

describe('omniboxSections before typing', () => {
  const ranked = [
    place('anna', { residents: [{ contactId: 'a', status: 'active' }] }),
    place('fav', { saved: true }),
    place('gym', { hotspot: { activeDays: 9, lastDay: '2026-10-01' } }),
    place('pred', { saved: true }),
  ];

  it('orders predictions, homes, saved, frequent without repeating a place', () => {
    const sections = omniboxSections(input({
      predictions: [{ placeId: 'pred', label: 'Pred', reasons: [{ kind: 'saved' }], score: 2 }],
      ranked,
    }));
    expect(sections.map((s) => [s.kind, s.rows.map((r) => (r.kind === 'place' ? r.placeId : r.kind))])).toEqual([
      ['predictions', ['pred']],
      ['homes', ['anna']],
      ['saved', ['fav']],
      ['frequent', ['gym']],
    ]);
  });

  it('heads an event with a real category with what suits it', () => {
    const sections = omniboxSections(input({
      context: { kind: 'event', category: 'Meal', attendeeIds: [], day: '2026-10-12' },
      predictions: [{ placeId: 'pred', label: 'Pred', reasons: [], score: 2 }],
    }));
    expect(sections[0].kind).toBe('forCategory');
  });

  it('leaves empty sections out', () => {
    expect(omniboxSections(input({}))).toEqual([]);
  });
});

describe('omniboxSections while typing', () => {
  const known = { placeId: 'home', label: 'Storgatan 5', lat: 56.8333, lon: 13.9333 };

  it('lists yours, then addresses, with the pin last', () => {
    const sections = omniboxSections(input({ query: 'stor', ranked: [place('p1')], addressHits: [hit('Storvägen 1', 59, 18)] }));
    expect(sections.map((s) => s.kind)).toEqual(['yours', 'addresses', 'pin']);
    expect(sections.at(-1)!.rows).toEqual([{ kind: 'pin' }]);
  });

  it('always offers the pin even with nothing found', () => {
    expect(omniboxSections(input({ query: 'zzz' })).map((s) => s.kind)).toEqual(['pin']);
  });

  it('folds an address within 30 m of a known place into that place', () => {
    const near = hit('Storgatan 5, Ljungby', 56.8334, 13.9334);
    const sections = omniboxSections(input({ query: 'storgatan 5', addressHits: [near], knownPoints: [known] }));
    expect(sections.map((s) => s.kind)).toEqual(['yours', 'pin']);
    expect(sections[0].rows).toEqual([{ kind: 'place', placeId: 'home', label: 'Storgatan 5', alreadyAPlace: near }]);
  });

  it('marks an already-listed place instead of adding it twice', () => {
    const near = hit('Storgatan 5, Ljungby', 56.8333, 13.9333);
    const sections = omniboxSections(input({ query: 'storgatan', ranked: [place('home')], addressHits: [near], knownPoints: [known] }));
    expect(sections[0].rows).toEqual([{ kind: 'place', placeId: 'home', label: 'home', context: undefined, alreadyAPlace: near }]);
  });

  it('keeps an address farther than 30 m as an address', () => {
    const far = hit('Storgatan 9, Ljungby', 56.834, 13.9333);
    expect(omniboxSections(input({ query: 'storgatan', addressHits: [far], knownPoints: [known] })).map((s) => s.kind))
      .toEqual(['addresses', 'pin']);
  });

  it('disables addresses and pin offline', () => {
    const sections = omniboxSections(input({ query: 'stor', online: false, ranked: [place('p1')] }));
    expect(sections).toEqual([
      { kind: 'yours', rows: [{ kind: 'place', placeId: 'p1', label: 'p1', context: undefined }] },
      { kind: 'addresses', rows: [], disabled: 'needsConnection' },
      { kind: 'pin', rows: [{ kind: 'pin' }], disabled: 'needsConnection' },
    ]);
  });
});
