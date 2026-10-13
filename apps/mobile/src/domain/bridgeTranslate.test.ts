import { describe, expect, it } from 'vitest';
import type { ContactDoc, ItemDoc, ResidencyDoc } from './docTypes';
import type { AddressHint, CalCapturePayload, ContactCapturePayload, ParsedCalRow, ParsedContactRow, PostalCapture, PublishedAddress } from './bridgeTranslate';
import {
  contactReviseIsEcho, mergeChannelTypes, parseProviderBirthday, parseRfc2445Duration, postalHints, publishedAddresses, sourceKeyOfPendingMarker,
  translateCalRow, translateContactRow,
} from './bridgeTranslate';

const payload = (over: Partial<CalCapturePayload> = {}): CalCapturePayload => ({
  title: 'From stock app', description: null, location: null,
  dtstart: Date.UTC(2026, 7, 3, 12, 0), dtend: Date.UTC(2026, 7, 3, 13, 0), duration: null,
  allDay: false, rrule: null, calendarSyncId: 'cal-1', ...over,
});

const row = (kind: ParsedCalRow['kind'], p: Partial<CalCapturePayload> = {}, over: Partial<ParsedCalRow> = {}): ParsedCalRow => ({
  kind, itemId: 'item-1', payload: payload(p), occurredAt: '2026-08-03T12:30:00.000Z', ...over,
});

const existing: ItemDoc = {
  id: 'item-1', title: 'Old', isAllDay: false,
  status: 'Confirmed', category: 'Meeting', tags: ['work'], parentItemId: 'p1',
  calendars: [{ calendarId: 'cal-1', status: 'Accepted' }],
};

describe('translateCalRow', () => {
  it('revise: schedule from capture, untouchable sections from the mirror doc', () => {
    const t = translateCalRow(row('revised'), existing);
    if (t.kind !== 'revise') throw new Error(t.kind);
    expect(t.core.startsAt).toBe('2026-08-03T12:00:00.000Z');
    expect(t.core.endsAt).toBe('2026-08-03T13:00:00.000Z');
    expect(t.core).toMatchObject({ title: 'From stock app', status: 'Confirmed', category: 'Meeting', tags: ['work'], parentItemId: 'p1' });
    expect(t.occurredAt).toBe('2026-08-03T12:30:00.000Z');
  });

  it('revise without mirror context keeps unknown sections null (= keep server-side)', () => {
    const t = translateCalRow(row('revised'), null);
    if (t.kind !== 'revise') throw new Error(t.kind);
    expect(t.core.status).toBeNull();
    expect(t.core.tags).toBeNull();
  });

  it('all-day capture maps to date fields', () => {
    const t = translateCalRow(row('revised', {
      allDay: true, dtstart: Date.UTC(2026, 7, 10), dtend: Date.UTC(2026, 7, 12),
    }), existing);
    if (t.kind !== 'revise') throw new Error(t.kind);
    expect(t.core).toMatchObject({ isAllDay: true, startDate: '2026-08-10', endDate: '2026-08-12', startsAt: null });
  });

  it('recurring capture: duration replaces dtend, RRULE prefix stripped', () => {
    const t = translateCalRow(row('revised', { dtend: null, duration: 'PT3600S', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO' }), existing);
    if (t.kind !== 'revise') throw new Error(t.kind);
    expect(t.core.endsAt).toBe('2026-08-03T13:00:00.000Z');
    expect(t.core.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('create needs a sourceKey and calendar mapping', () => {
    const ok = translateCalRow(row('created', {}, { sourceKey: 'bridge:u1' }), null);
    expect(ok).toMatchObject({ kind: 'create', calendarId: 'cal-1', sourceKey: 'bridge:u1' });
    expect(translateCalRow(row('created', { calendarSyncId: null }, { sourceKey: 'bridge:u1' }), null)).toMatchObject({ kind: 'skip' });
    expect(translateCalRow(row('created'), null)).toMatchObject({ kind: 'skip' });
  });

  it('a revise keeps the series zone; a create takes the phone zone; all-day carries none', () => {
    const revised = translateCalRow(row('revised'), { ...existing, startTimezone: 'Asia/Tokyo' });
    if (revised.kind !== 'revise') throw new Error(revised.kind);
    expect(revised.core).toMatchObject({ startTimezone: 'Asia/Tokyo', endTimezone: 'Asia/Tokyo' });
    const created = translateCalRow(row('created', {}, { sourceKey: 'bridge:u1' }), null);
    if (created.kind !== 'create') throw new Error(created.kind);
    expect(created.core.startTimezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const allDay = translateCalRow(row('revised', { allDay: true, dtstart: Date.UTC(2026, 7, 10), dtend: null }), { ...existing, startTimezone: 'Asia/Tokyo' });
    if (allDay.kind !== 'revise') throw new Error(allDay.kind);
    expect(allDay.core.startTimezone).toBeNull();
  });

  it('delete translates regardless of payload; startless non-deletes skip', () => {
    expect(translateCalRow(row('deleted', { dtstart: null }), existing)).toMatchObject({ kind: 'delete', itemId: 'item-1' });
    expect(translateCalRow(row('revised', { dtstart: null }), existing)).toMatchObject({ kind: 'skip' });
  });
});

describe('captured location', () => {
  const placed: ItemDoc = { ...existing, placeId: 'p1', locationLabel: 'Folkets Park' };
  const coreOf = (t: ReturnType<typeof translateCalRow>) => {
    if (t.kind !== 'revise' && t.kind !== 'create') throw new Error(t.kind);
    return t.core;
  };

  it('an untouched location keeps the place', () => {
    const core = coreOf(translateCalRow(row('revised', { location: 'Folkets Park', publishedLocation: 'Folkets Park' }), placed));
    expect(core).not.toHaveProperty('location');
    expect(core).not.toHaveProperty('locationUnresolved');
  });

  it('a row the mirror moved on from keeps the newer place', () => {
    const core = coreOf(translateCalRow(row('revised', { location: 'Old hall', publishedLocation: 'Old hall' }), placed));
    expect(core).not.toHaveProperty('locationUnresolved');
  });

  it('a cleared location clears the place', () => {
    const core = coreOf(translateCalRow(row('revised', { location: '  ', publishedLocation: 'Folkets Park' }), placed));
    expect(core).toMatchObject({ location: null, locationUnresolved: true });
  });

  it('typed text becomes an unresolved label', () => {
    const core = coreOf(translateCalRow(row('revised', { location: ' Storgatan 1 ', publishedLocation: 'Folkets Park' }), placed));
    expect(core).toMatchObject({ location: 'Storgatan 1', locationUnresolved: true });
  });

  it('without a published value, text matching the mirror is kept and other text is unresolved', () => {
    expect(coreOf(translateCalRow(row('revised', { location: 'Folkets Park' }), placed))).not.toHaveProperty('locationUnresolved');
    expect(coreOf(translateCalRow(row('revised', { location: 'Kyrkan' }), placed))).toMatchObject({ location: 'Kyrkan', locationUnresolved: true });
    expect(coreOf(translateCalRow(row('revised', { location: 'Kyrkan' }), null))).not.toHaveProperty('locationUnresolved');
  });

  it('a create with text carries it unresolved; without text, nothing', () => {
    const withText = coreOf(translateCalRow(row('created', { location: 'Kyrkan' }, { sourceKey: 'bridge:u1' }), null));
    expect(withText).toMatchObject({ location: 'Kyrkan', locationUnresolved: true });
    expect(coreOf(translateCalRow(row('created', {}, { sourceKey: 'bridge:u1' }), null))).not.toHaveProperty('locationUnresolved');
  });
});

describe('parseRfc2445Duration', () => {
  it('parses the provider subset', () => {
    expect(parseRfc2445Duration('P1D')).toBe(86_400_000);
    expect(parseRfc2445Duration('PT1800S')).toBe(1_800_000);
    expect(parseRfc2445Duration('PT30M')).toBe(1_800_000);
    expect(parseRfc2445Duration('P2W')).toBe(14 * 86_400_000);
    expect(parseRfc2445Duration('P1DT12H')).toBe(129_600_000);
    expect(parseRfc2445Duration('nonsense')).toBeNull();
    expect(parseRfc2445Duration('P')).toBeNull();
  });
});

describe('translateContactRow', () => {
  const contactRow = (p: Partial<ContactCapturePayload> = {}, kind: ParsedContactRow['kind'] = 'revised'): ParsedContactRow => ({
    kind, contactId: 'c-1', occurredAt: '2026-08-03T12:30:00.000Z',
    payload: {
      given: 'Alva', family: 'B', nickname: null, middle: null, notes: null, birthday: '2019-03-07',
      phones: [{ value: '070', type: 2, preferred: true }],
      emails: [{ value: 'a@b.se', type: 2, preferred: false }],
      ...p,
    },
  });

  it('revise carries names/birthday; channels ride the wholesale op with mapped types', () => {
    const t = translateContactRow(contactRow());
    if (t.kind !== 'revise') throw new Error(t.kind);
    expect(t.core).toMatchObject({ givenName: 'Alva', familyName: 'B', birthday: { year: 2019, month: 3, day: 7 }, channels: null, tags: null });
    expect(t.channels).toEqual([
      { medium: 'Phone', value: '070', type: null, preferred: true },      // TYPE_MOBILE → no label
      { medium: 'Email', value: 'a@b.se', type: 'Work', preferred: false },
    ]);
  });

  it('year-less provider birthdays parse; junk does not', () => {
    expect(parseProviderBirthday('--03-07')).toEqual({ year: null, month: 3, day: 7 });
    expect(parseProviderBirthday('2019-03-07')).toEqual({ year: 2019, month: 3, day: 7 });
    expect(parseProviderBirthday('March 7')).toBeNull();
    expect(parseProviderBirthday(null)).toBeNull();
  });

  it('delete translates', () => {
    expect(translateContactRow(contactRow({}, 'deleted'))).toMatchObject({ kind: 'delete', contactId: 'c-1' });
  });
});

describe('write-back echo guard + type preservation', () => {
  const doc: ContactDoc = {
    id: 'c-1', addressBookId: 'b1', givenName: 'Alva', familyName: 'B',
    birthday: { year: 2019, month: 3, day: 7 },
    channels: [
      { medium: 'Phone', value: '070', type: 'Mobile', preferred: true },
      { medium: 'Email', value: 'a@b.se', type: 'Work', preferred: false },
    ],
  };

  it('re-attaches mirror channel types the provider ints lost', () => {
    const merged = mergeChannelTypes(
      [{ medium: 'Phone', value: '070', type: null, preferred: true }],
      doc.channels!,
    );
    expect(merged[0].type).toBe('Mobile');
  });

  it('detects an echo (same content, string-vs-number birthday tolerated)', () => {
    const t = translateContactRow({
      kind: 'revised', contactId: 'c-1', occurredAt: '2026-08-03T12:30:00.000Z',
      payload: {
        given: 'Alva', family: 'B', birthday: '2019-03-07',
        phones: [{ value: '070', type: 2, preferred: true }],
        emails: [{ value: 'a@b.se', type: 2, preferred: false }],
      },
    });
    if (t.kind !== 'revise') throw new Error(t.kind);
    const channels = mergeChannelTypes(t.channels, doc.channels!);
    expect(contactReviseIsEcho(t.core, channels, doc)).toBe(true);
  });

  it('a real edit is not an echo', () => {
    const t = translateContactRow({
      kind: 'revised', contactId: 'c-1', occurredAt: '2026-08-03T12:30:00.000Z',
      payload: { given: 'Alva', family: 'Renamed', birthday: '2019-03-07', phones: [{ value: '070', type: 2, preferred: true }], emails: [{ value: 'a@b.se', type: 2, preferred: false }] },
    });
    if (t.kind !== 'revise') throw new Error(t.kind);
    expect(contactReviseIsEcho(t.core, mergeChannelTypes(t.channels, doc.channels!), doc)).toBe(false);
  });

  it('removing every phone is a change, not an echo', () => {
    const t = translateContactRow({
      kind: 'revised', contactId: 'c-1', occurredAt: '2026-08-03T12:30:00.000Z',
      payload: { given: 'Alva', family: 'B', birthday: '2019-03-07', phones: [], emails: [{ value: 'a@b.se', type: 2, preferred: false }] },
    });
    if (t.kind !== 'revise') throw new Error(t.kind);
    expect(contactReviseIsEcho(t.core, mergeChannelTypes(t.channels, doc.channels!), doc)).toBe(false);
  });

  it('captured null birthday means keep — still an echo', () => {
    const t = translateContactRow({
      kind: 'revised', contactId: 'c-1', occurredAt: '2026-08-03T12:30:00.000Z',
      payload: { given: 'Alva', family: 'B', birthday: null, phones: [{ value: '070', type: 2, preferred: true }], emails: [{ value: 'a@b.se', type: 2, preferred: false }] },
    });
    if (t.kind !== 'revise') throw new Error(t.kind);
    expect(contactReviseIsEcho(t.core, mergeChannelTypes(t.channels, doc.channels!), doc)).toBe(true);
  });
});

describe('sourceKeyOfPendingMarker', () => {
  it('maps the capture marker to the deterministic sourceKey', () => {
    expect(sourceKeyOfPendingMarker('pending:abc-123')).toBe('bridge:abc-123');
    expect(sourceKeyOfPendingMarker('item-guid')).toBeNull();
    expect(sourceKeyOfPendingMarker('pending:')).toBeNull();
  });
});

describe('publishedAddresses', () => {
  const residency = (id: string, over: Partial<ResidencyDoc> = {}): ResidencyDoc => ({ id, contactId: 'c-1', placeId: `p-${id}`, type: 'Home', ...over });
  const places: Record<string, { name: string; formattedAddress?: string | null }> = {
    'p-r1': { name: 'Home', formattedAddress: 'Storgatan 1, 341 30 Ljungby' },
    'p-r2': { name: 'Stugan', formattedAddress: null },
    'p-r3': { name: 'Old flat', formattedAddress: 'Kungsgatan 2' },
  };

  it('current residencies with a looked-up place, by address else name', () => {
    const out = publishedAddresses(
      [residency('r1'), residency('r2'), residency('r3', { movedOut: { year: 2020 } }), residency('r4')],
      (id) => places[id] ?? null,
      new Date(2026, 9, 13),
    );
    expect(out).toEqual([{ residencyId: 'r1', text: 'Storgatan 1, 341 30 Ljungby' }, { residencyId: 'r2', text: 'Stugan' }]);
  });
});

describe('postalHints', () => {
  const published: PublishedAddress[] = [
    { residencyId: 'r1', text: 'Storgatan 1, 341 30 Ljungby' },
    { residencyId: 'r2', text: 'Sjövägen 4, Torsby' },
  ];
  const postal = (text: string | null, over: Partial<PostalCapture> = {}): PostalCapture => ({
    text, type: 1, label: null, street: null, city: null, postcode: null, country: null, source: null, published: null, ...over,
  });
  const asPublished = (p: PublishedAddress) => postal(p.text, { source: p.residencyId, published: p.text });
  const hint = (id: string, text: string, residencyId: string | null = null): AddressHint => ({
    id, contactId: 'c-1', residencyId, type: 'Home', text, street: null, postcode: null, city: null, country: null,
  });
  let n = 0;
  const newId = () => `h-new-${++n}`;
  const run = (captured: PostalCapture[], hints: AddressHint[] = []) => postalHints('c-1', captured, published, hints, newId);

  it('unchanged published rows ask for nothing', () => {
    expect(run(published.map(asPublished))).toEqual({ put: [], remove: [], restore: false });
  });

  it('an edited published address becomes a hint standing in for it', () => {
    const { put, restore } = run([
      postal('Storgatan 3, 341 30 Ljungby', { source: 'r1', published: published[0].text, street: 'Storgatan 3', postcode: '341 30', city: 'Ljungby', type: 2 }),
      asPublished(published[1]),
    ]);
    expect(put).toEqual([{
      id: expect.stringMatching(/^h-new-/), contactId: 'c-1', residencyId: 'r1', type: 'Work', text: 'Storgatan 3, 341 30 Ljungby',
      street: 'Storgatan 3', postcode: '341 30', city: 'Ljungby', country: null,
    }]);
    expect(restore).toBe(false);
  });

  it('editing it again updates the standing hint', () => {
    const standing = hint('h1', 'Storgatan 3', 'r1');
    const { put, remove } = run([postal('Storgatan 5', { source: 'r1', published: published[0].text }), asPublished(published[1])], [standing]);
    expect(put).toMatchObject([{ id: 'h1', residencyId: 'r1', text: 'Storgatan 5' }]);
    expect(remove).toEqual([]);
  });

  it('a new address becomes a hint of its own; a duplicate of it does not', () => {
    const { put } = run([...published.map(asPublished), postal('Kyrkvägen 9, Lysvik'), postal('kyrkvägen 9\nLysvik')]);
    expect(put).toMatchObject([{ residencyId: null, text: 'Kyrkvägen 9, Lysvik' }]);
  });

  it('a hint row edited in the stock app updates the hint', () => {
    const h = hint('h1', 'Kyrkvägen 9');
    const { put, remove } = run([...published.map(asPublished), postal('Kyrkvägen 11', { source: 'hint:h1', published: 'Kyrkvägen 9' })], [h]);
    expect(put).toMatchObject([{ id: 'h1', text: 'Kyrkvägen 11' }]);
    expect(remove).toEqual([]);
  });

  it('an untouched hint row keeps the hint', () => {
    const h = hint('h1', 'Kyrkvägen 9');
    expect(run([...published.map(asPublished), postal('Kyrkvägen 9', { source: 'hint:h1', published: 'Kyrkvägen 9' })], [h]))
      .toEqual({ put: [], remove: [], restore: false });
  });

  it('a hint row edited back to the address it stands in for dismisses the hint', () => {
    const h = hint('h1', 'Storgatan 3', 'r1');
    const { put, remove } = run([postal(published[0].text, { source: 'hint:h1', published: 'Storgatan 3' }), asPublished(published[1])], [h]);
    expect(put).toEqual([]);
    expect(remove).toEqual(['h1']);
  });

  it('a hint row deleted in the stock app dismisses the hint', () => {
    expect(run(published.map(asPublished), [hint('h1', 'Kyrkvägen 9')])).toEqual({ put: [], remove: ['h1'], restore: false });
  });

  it('a deleted published address is restored', () => {
    expect(run([asPublished(published[1])])).toEqual({ put: [], remove: [], restore: true });
  });

  it('rows the stock app re-inserted without their tags match by text', () => {
    const h = hint('h1', 'Kyrkvägen 9');
    const retyped = [postal('Storgatan 1\n341 30 Ljungby'), postal(published[1].text), postal('Kyrkvägen 9')];
    expect(run(retyped, [h])).toEqual({ put: [], remove: [], restore: false });
  });

  it('a row for an address no longer published is ignored untouched and a new hint once edited', () => {
    expect(run([...published.map(asPublished), postal('Gamla 1', { source: 'r9', published: 'Gamla 1' })]).put).toEqual([]);
    expect(run([...published.map(asPublished), postal('Gamla 2', { source: 'r9', published: 'Gamla 1' })]).put).toMatchObject([{ residencyId: null, text: 'Gamla 2' }]);
  });

  it('blank rows are skipped and a custom Vacation label maps back', () => {
    const { put } = run([...published.map(asPublished), postal('  '), postal('Fjällstugan', { type: 0, label: 'Vacation' })]);
    expect(put).toMatchObject([{ text: 'Fjällstugan', type: 'Vacation' }]);
  });
});
