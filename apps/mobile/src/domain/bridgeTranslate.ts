import { residencyStatus } from '@danbro96/lupira-domain-contacts/fuzzyDate';
import {
  allDayKey, hasSeriesOccurrence, occurrenceEdit, occurrenceKey, overrideFor, type OccurrenceChange, type OccurrenceEdit, type OccurrencePatch,
  type SeriesItem,
} from '@lupira/cal-domain/seriesOccurrences';
import { deviceTimeZone } from '@lupira/cal-domain/zonedTime';
import type { ContactDoc, ItemDoc, PartialDateDto, ReachChannel, ResidencyDoc } from './docTypes';
import type { ClientOp, ContactCore, ItemCore } from './ops';

/** Pure half of the bridge write-back: a captured provider edit → the op the engine should enqueue.
 *  The impure half (id resolution, mirror lookup, enqueue, ack) lives in sync/bridge.ts. Warts are
 *  inherited from the REST contract: title/description cleared in the stock app stay unchanged
 *  server-side (null = keep). A location typed in the stock app can't be resolved there, so it lands as a label
 *  with no place for the app to resolve later. */

export type CalCapturePayload = {
  title: string | null;
  description: string | null;
  location: string | null;
  /** What the publisher last wrote (absent on rows captured before it recorded one). */
  publishedLocation?: string | null;
  dtstart: number | null;
  dtend: number | null;
  duration: string | null;   // RFC2445, recurring rows carry this instead of dtend
  allDay: boolean;
  rrule: string | null;
  calendarSyncId: string | null;
  /** The provider's STATUS: 0 tentative, 1 confirmed, 2 cancelled. */
  status?: number | null;
  /** Set on a row for one occurrence of the series `originalSyncId`, by its unmodified start. */
  originalSyncId?: string | null;
  originalInstanceTime?: number | null;
  /** A series row's excluded starts, and those last published (null = not recorded). */
  exdates?: number[];
  publishedExdates?: number[] | null;
};

export type ParsedCalRow = {
  kind: 'created' | 'revised' | 'deleted';
  itemId: string;
  sourceKey?: string;
  payload: CalCapturePayload;
  occurredAt: string;
};

export type CalTranslation =
  | { kind: 'create'; itemId: string; sourceKey: string; calendarId: string; core: ItemCore; occurredAt: string }
  | { kind: 'revise'; itemId: string; core: ItemCore; occurredAt: string }
  | { kind: 'delete'; itemId: string; occurredAt: string }
  | { kind: 'skip'; reason: string };

export function translateCalRow(row: ParsedCalRow, existing: ItemDoc | null): CalTranslation {
  if (row.kind === 'deleted') return { kind: 'delete', itemId: row.itemId, occurredAt: row.occurredAt };

  const p = row.payload;
  if (p.dtstart === null) return { kind: 'skip', reason: 'captured row has no start' };
  // The provider hands over instants only. A revise keeps the series' zone — clearing it would re-anchor a
  // repeating event to UTC — and a create takes the phone's, the zone the stock app showed it in.
  const zone = p.allDay ? null : row.kind === 'created' ? deviceTimeZone() : (existing?.startTimezone ?? null);

  const core: ItemCore = {
    title: p.title?.trim() || null,
    description: p.description?.trim() || null,
    // Sections the stock app can't touch ride through from the mirror (whole-section write).
    status: existing?.status ?? null,
    category: existing?.category ?? null,
    tags: existing?.tags ?? null,
    parentItemId: existing?.parentItemId ?? null,
    isAllDay: p.allDay,
    startsAt: null, endsAt: null, startDate: null, endDate: null,
    startTimezone: zone, endTimezone: zone,
    recurrenceRule: p.rrule ? p.rrule.replace(/^RRULE:/i, '') : null,
    ...placeFieldsOf(p, existing, row.kind === 'created'),
  };

  const endMs = p.dtend ?? (p.duration ? p.dtstart + (parseRfc2445Duration(p.duration) ?? 0) : null);
  if (p.allDay) {
    core.startDate = utcDayKey(p.dtstart);
    core.endDate = endMs && endMs > p.dtstart ? utcDayKey(endMs) : null;
  } else {
    core.startsAt = new Date(p.dtstart).toISOString();
    core.endsAt = endMs && endMs > p.dtstart ? new Date(endMs).toISOString() : null;
  }

  if (row.kind === 'created') {
    if (!row.sourceKey) return { kind: 'skip', reason: 'created row without sourceKey' };
    if (!p.calendarSyncId) return { kind: 'skip', reason: 'created row without a mapped calendar' };
    return { kind: 'create', itemId: row.itemId, sourceKey: row.sourceKey, calendarId: p.calendarSyncId, core, occurredAt: row.occurredAt };
  }
  return { kind: 'revise', itemId: row.itemId, core, occurredAt: row.occurredAt };
}

export type ParsedOccurrenceRow = {
  deleted: boolean;
  itemId: string;
  originalStart: string;
  payload: CalCapturePayload;
  occurredAt: string;
};

export type OccurrenceTranslation =
  | { kind: 'occurrence'; itemId: string; originalStart: string; edit: Exclude<OccurrenceEdit, { kind: 'restore' }>; occurredAt: string }
  | { kind: 'restore'; itemId: string; originalStart: string; occurredAt: string }
  | { kind: 'skip'; reason: string };

const PROVIDER_CANCELLED = 2;
const DAY_MS = 86_400_000;

/** A captured row for one occurrence of a series → its change. Deleting or cancelling it there excludes it; per-occurrence
 *  places don't exist, so its location is not read. What the mirror already holds is an echo. */
export function translateOccurrenceRow(row: ParsedOccurrenceRow, existing: ItemDoc | null): OccurrenceTranslation {
  if (!existing) return { kind: 'skip', reason: 'series not in the mirror' };
  if (!hasSeriesOccurrence(existing, row.originalStart)) return { kind: 'skip', reason: 'no such occurrence in the series' };
  const at = Date.parse(row.originalStart);
  const excluded = (existing.excludedOccurrences ?? []).some((x) => Date.parse(x) === at);
  const target = { itemId: row.itemId, originalStart: occurrenceKey(at), occurredAt: row.occurredAt };
  const p = row.payload;
  if (row.deleted || p.status === PROVIDER_CANCELLED) {
    return excluded ? { kind: 'skip', reason: 'echo' } : { kind: 'occurrence', ...target, edit: { kind: 'exclude' } };
  }
  if (p.dtstart === null) return { kind: 'skip', reason: 'captured row has no start' };

  const endMs = p.dtend ?? (p.duration ? p.dtstart + (parseRfc2445Duration(p.duration) ?? 0) : null);
  const patch: OccurrencePatch = {
    title: p.title?.trim() || null,
    description: p.description?.trim() || null,
    ...(existing.isAllDay
      ? { startsAt: allDayKey(utcDayKey(p.dtstart)), endsAt: endMs && endMs > p.dtstart + DAY_MS ? allDayKey(utcDayKey(endMs - DAY_MS)) : null }
      : { startsAt: new Date(p.dtstart).toISOString(), endsAt: endMs && endMs > p.dtstart ? new Date(endMs).toISOString() : null }),
  };
  const edit = occurrenceEdit(existing as SeriesItem, target.originalStart, patch);
  const current = overrideFor(existing, target.originalStart);
  if (edit.kind === 'restore') return excluded || current ? { kind: 'restore', ...target } : { kind: 'skip', reason: 'echo' };
  if (edit.kind === 'change' && !excluded && current && sameChange(current, edit.change)) return { kind: 'skip', reason: 'echo' };
  return { kind: 'occurrence', ...target, edit: edit.kind === 'change' ? edit : { kind: 'exclude' } };
}

function sameChange(a: OccurrenceChange, b: OccurrenceChange): boolean {
  const instant = (v?: string | null) => (v ? Date.parse(v) : null);
  return instant(a.startsAt) === instant(b.startsAt) && instant(a.endsAt) === instant(b.endsAt)
    && (a.title ?? null) === (b.title ?? null) && (a.description ?? null) === (b.description ?? null) && (a.status ?? null) === (b.status ?? null);
}

/** Deleting a series in the stock app also hands over its exception rows; their occurrence ops would 404 behind the delete. */
export function withoutOccurrencesOfDeleted(ops: readonly ClientOp[]): ClientOp[] {
  const deleted = new Set(ops.flatMap((o) => (o.kind === 'item.delete' ? [o.itemId] : [])));
  return ops.filter((o) => !((o.kind === 'item.occurrence' || o.kind === 'item.occurrence.restore') && deleted.has(o.itemId)));
}

/** The exclusions the user changed on a series row: against what was published, never the mirror, so an exclusion
 *  made elsewhere and not yet published isn't undone. */
export function exclusionChanges(p: CalCapturePayload, existing: ItemDoc | null): { exclude: string[]; restore: string[] } {
  if (!existing || !p.exdates || p.publishedExdates == null) return { exclude: [], restore: [] };
  const captured = new Set(p.exdates);
  const published = new Set(p.publishedExdates);
  const mirrored = new Set((existing.excludedOccurrences ?? []).map((x) => Date.parse(x)));
  return {
    exclude: p.exdates.filter((t) => !published.has(t) && !mirrored.has(t)).map(occurrenceKey).filter((k) => hasSeriesOccurrence(existing, k)),
    restore: p.publishedExdates.filter((t) => !captured.has(t) && mirrored.has(t)).map(occurrenceKey),
  };
}

/** A row the mirror moved on from still shows its published location; only a real edit may touch the place. */
function placeFieldsOf(p: CalCapturePayload, existing: ItemDoc | null, created: boolean): Pick<ItemCore, 'location' | 'locationUnresolved'> {
  const captured = p.location?.trim() || null;
  const unresolved = { location: captured, locationUnresolved: true };
  if (created) return captured ? unresolved : {};
  if (p.publishedLocation !== undefined && captured === (p.publishedLocation?.trim() || null)) return {};
  if (!existing) return p.publishedLocation === undefined ? {} : unresolved;
  return captured === (existing.locationLabel?.trim() || null) ? {} : unresolved;
}

/** RFC2445 duration subset the calendar provider emits (P1D, PT1800S, P1DT12H, P2W …). */
export function parseRfc2445Duration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, sign, w, d, h, min, s] = m;
  const ms =
    (Number(w ?? 0) * 7 * 86_400 + Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(min ?? 0) * 60 + Number(s ?? 0)) * 1000;
  if (ms === 0 && !w && !d && !h && !min && !s) return null;
  return sign === '-' ? -ms : ms;
}

/** What ContactsCapturer emits for a dirty raw contact. Channel `type` is the provider's raw int
 *  (Phone.TYPE_* / Email.TYPE_*); translation maps it back onto the app's loose type strings. */
export type ContactCapturePayload = {
  given?: string | null;
  middle?: string | null;
  family?: string | null;
  nickname?: string | null;
  notes?: string | null;
  birthday?: string | null;   // "yyyy-MM-dd" or the provider's year-less "--MM-dd"
  phones?: { value: string; type: number | null; preferred: boolean }[];
  emails?: { value: string; type: number | null; preferred: boolean }[];
  /** Absent on rows captured before addresses were published. */
  postals?: PostalCapture[];
};

/** A postal row as the stock app left it. `source` is what the publisher tagged it with (a residency id, or
 *  `hint:<id>`), `published` the text it wrote; a row the user added carries neither. */
export type PostalCapture = {
  text: string | null;
  type: number | null;
  label: string | null;
  street: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  source: string | null;
  published: string | null;
};

/** A current residency as the publisher writes it (MirrorReader.kt's MirrorAddress). */
export type PublishedAddress = { residencyId: string; text: string };

/** An address typed in the stock app that no place backs yet, kept on the phone only; `residencyId` is the
 *  published address it stands in for. */
export type AddressHint = {
  id: string;
  contactId: string;
  residencyId: string | null;
  type: string | null;
  text: string;
  street: string | null;
  postcode: string | null;
  city: string | null;
  country: string | null;
};

export type HintChanges = { put: AddressHint[]; remove: string[]; restore: boolean };

export const HINT_PREFIX = 'hint:';

/** Current residencies with a looked-up place, as the publisher shows them: the address, else the place's name. */
export function publishedAddresses(
  residencies: readonly ResidencyDoc[], placeOf: (placeId: string) => { name?: string | null; formattedAddress?: string | null } | null,
  today = new Date(),
): PublishedAddress[] {
  return residencies.flatMap((r) => {
    if (residencyStatus(r.movedIn ?? null, r.movedOut ?? null, today) !== 'active') return [];
    const place = placeOf(r.placeId);
    const text = place?.formattedAddress || place?.name;
    return text ? [{ residencyId: r.id, text }] : [];
  });
}

/** A contact's captured postal rows against what was published and the hints already kept: an edited published
 *  address becomes a hint standing in for it, a new one a hint of its own, an edited hint is updated, a hint row
 *  deleted in the stock app is dismissed, and a deleted published address is restored (`restore`). Rows the stock
 *  app re-inserted without their tags match by text. */
export function postalHints(
  contactId: string, captured: readonly PostalCapture[], published: readonly PublishedAddress[], hints: readonly AddressHint[], newId: () => string,
): HintChanges {
  const put: AddressHint[] = [];
  const kept = new Set<string>();
  const seen = new Set(hints.flatMap((h) => (h.residencyId ? [h.residencyId] : [])));
  const publishedByKey = new Map(published.map((p) => [addressKey(p.text), p.residencyId]));

  for (const row of captured) {
    const text = row.text?.trim();
    if (!text) continue;
    const key = addressKey(text);
    const untouched = row.published != null && key === addressKey(row.published);
    const hint = row.source?.startsWith(HINT_PREFIX) ? hints.find((h) => h.id === row.source!.slice(HINT_PREFIX.length)) : undefined;
    if (hint) {
      const replaced = published.find((p) => p.residencyId === hint.residencyId);
      if (replaced && addressKey(replaced.text) === key) continue;
      kept.add(hint.id);
      if (!untouched) put.push({ ...hint, ...hintFieldsOf(row, text) });
      continue;
    }
    const residency = published.find((p) => p.residencyId === row.source);
    if (residency) seen.add(residency.residencyId);
    if (untouched) continue;
    if (residency) {
      const standing = hints.find((h) => h.residencyId === residency.residencyId);
      if (standing) kept.add(standing.id);
      put.push({ ...(standing ?? { id: newId(), contactId, residencyId: residency.residencyId }), ...hintFieldsOf(row, text) });
      continue;
    }
    const sameResidency = publishedByKey.get(key);
    if (sameResidency) {
      seen.add(sameResidency);
      continue;
    }
    const sameHint = [...hints, ...put].find((h) => addressKey(h.text) === key);
    if (sameHint) kept.add(sameHint.id);
    else put.push({ id: newId(), contactId, residencyId: null, ...hintFieldsOf(row, text) });
  }

  return {
    put,
    remove: hints.filter((h) => !kept.has(h.id)).map((h) => h.id),
    restore: published.some((p) => !seen.has(p.residencyId)),
  };
}

function hintFieldsOf(row: PostalCapture, text: string): Omit<AddressHint, 'id' | 'contactId' | 'residencyId'> {
  return {
    type: postalTypeName(row.type, row.label),
    text,
    street: row.street?.trim() || null,
    postcode: row.postcode?.trim() || null,
    city: row.city?.trim() || null,
    country: row.country?.trim() || null,
  };
}

/** Addresses compare loosely: the provider re-joins its parts with newlines where the publisher wrote commas. */
function addressKey(text: string): string {
  return text.toLocaleLowerCase().replace(/[\s,]+/g, ' ').trim();
}

// Provider ints: StructuredPostal TYPE_CUSTOM=0, TYPE_HOME=1, TYPE_WORK=2, TYPE_OTHER=3.
function postalTypeName(type: number | null, label: string | null): string | null {
  if (type === 0) return label?.trim().toLowerCase() === 'vacation' ? 'Vacation' : 'Other';
  return type === 1 ? 'Home' : type === 2 ? 'Work' : type === 3 ? 'Other' : null;
}

export type ParsedContactRow = {
  kind: 'revised' | 'deleted';
  contactId: string;
  payload: ContactCapturePayload;
  occurredAt: string;
};

export type ContactTranslation =
  | { kind: 'revise'; contactId: string; core: ContactCore; channels: ReachChannel[]; occurredAt: string }
  | { kind: 'delete'; contactId: string; occurredAt: string };

/** One dirty raw contact → a core revise (names/birthday/notes; null = keep for anything the stock app
 *  can't express) plus a wholesale channels replacement (revise UNION-merges, so channels never ride it). */
export function translateContactRow(row: ParsedContactRow): ContactTranslation {
  if (row.kind === 'deleted') return { kind: 'delete', contactId: row.contactId, occurredAt: row.occurredAt };
  const p = row.payload;
  const core: ContactCore = {
    givenName: p.given?.trim() || null,
    middleName: p.middle?.trim() || null,
    familyName: p.family?.trim() || null,
    nickname: p.nickname?.trim() || null,
    displayNameFormat: null,
    kind: null,
    birthday: parseProviderBirthday(p.birthday),
    notes: p.notes?.trim() || null,
    pronouns: null,
    channels: null,
    tags: null,
  };
  const channels: ReachChannel[] = [
    ...(p.phones ?? []).map((c) => ({ medium: 'Phone', value: c.value, type: phoneTypeName(c.type), preferred: c.preferred })),
    ...(p.emails ?? []).map((c) => ({ medium: 'Email', value: c.value, type: emailTypeName(c.type), preferred: c.preferred })),
  ].filter((c) => c.value.trim().length > 0);
  return { kind: 'revise', contactId: row.contactId, core, channels, occurredAt: row.occurredAt };
}

export function parseProviderBirthday(value: string | null | undefined): PartialDateDto | null {
  if (!value) return null;
  const yearless = /^--(\d{2})-(\d{2})$/.exec(value);
  if (yearless) return { year: null, month: Number(yearless[1]), day: Number(yearless[2]) };
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (full) return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) };
  return null;
}

// Provider ints: Phone TYPE_HOME=1, TYPE_MOBILE=2, TYPE_WORK=3; Email TYPE_HOME=1, TYPE_WORK=2.
function phoneTypeName(type: number | null): string | null {
  return type === 1 ? 'Home' : type === 3 ? 'Work' : null;
}

function emailTypeName(type: number | null): string | null {
  return type === 2 ? 'Work' : null;
}

/** Captured channels lose type fidelity (provider ints can't express the app's free-text types, e.g.
 *  'Mobile' maps to null) — re-attach the mirror's type where medium+value still match. */
export function mergeChannelTypes(captured: ReachChannel[], docChannels: ReachChannel[]): ReachChannel[] {
  return captured.map((c) => {
    if (c.type != null) return c;
    const match = docChannels.find((d) => d.medium === c.medium && d.value.toLowerCase() === c.value.toLowerCase());
    return match?.type != null ? { ...c, type: match.type } : c;
  });
}

/** Write-back echo guard: a dirty flag can fire without a change the app cares about (provider
 *  bookkeeping, cosmetic edits). Skip the ops when everything stock-expressible matches the mirror. */
export function contactReviseIsEcho(core: ContactCore, channels: ReachChannel[], doc: ContactDoc): boolean {
  const cur = contactCoreOfDoc(doc);
  const names = ['givenName', 'middleName', 'familyName', 'nickname', 'notes'] as const;
  if (!names.every((k) => (core[k] ?? null) === (cur.core[k] ?? null))) return false;
  if (core.birthday !== null && partialKey(core.birthday) !== partialKey(cur.core.birthday)) return false;
  return canonChannels(channels) === canonChannels(cur.channels);
}

function partialKey(b: PartialDateDto | null | undefined): string {
  if (!b) return '';
  return `${b.year ?? ''}-${b.month}-${b.day}`;
}

function canonChannels(channels: ReachChannel[]): string {
  return channels
    .map((c) => `${c.medium}|${c.value.trim().toLowerCase()}|${c.preferred}`)
    .sort()
    .join(';');
}

/** Existing mirror doc → the same ContactCore, for deciding whether a captured revise actually changed
 *  anything the stock app can express (echo guard on the write-back side). */
export function contactCoreOfDoc(doc: ContactDoc): { core: ContactCore; channels: ReachChannel[] } {
  return {
    core: {
      givenName: doc.givenName ?? null,
      middleName: doc.middleName ?? null,
      familyName: doc.familyName ?? null,
      nickname: doc.nickname ?? null,
      displayNameFormat: null,
      kind: null,
      birthday: doc.birthday ?? null,
      notes: doc.notes ?? null,
      pronouns: null,
      channels: null,
      tags: null,
    },
    channels: (doc.channels ?? []).map((c) => ({ medium: c.medium, value: c.value, type: c.type ?? null, preferred: c.preferred })),
  };
}

export const PENDING_PREFIX = 'pending:';

/** The capturer's pending marker doubles as the deterministic sourceKey, so re-drains converge on the
 *  same aggregate: "pending:<uuid>" → sourceKey "bridge:<uuid>". */
export function sourceKeyOfPendingMarker(marker: string): string | null {
  if (!marker.startsWith(PENDING_PREFIX)) return null;
  const uuid = marker.slice(PENDING_PREFIX.length);
  return uuid ? `bridge:${uuid}` : null;
}

function utcDayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
