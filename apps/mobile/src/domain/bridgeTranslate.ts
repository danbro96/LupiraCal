import { deviceTimeZone } from '@lupira/cal-domain/zonedTime';
import type { ContactDoc, ItemDoc, PartialDateDto, ReachChannel } from './docTypes';
import type { ContactCore, ItemCore } from './ops';

/** Pure half of the bridge write-back: a captured provider edit → the op the engine should enqueue.
 *  The impure half (id resolution, mirror lookup, enqueue, ack) lives in sync/bridge.ts. Warts are
 *  inherited from the REST contract: title/description cleared in the stock app stay unchanged
 *  server-side (null = keep), and EVENT_LOCATION is publish-only (ItemCore has no location field). */

export type CalCapturePayload = {
  title: string | null;
  description: string | null;
  location: string | null;
  dtstart: number | null;
  dtend: number | null;
  duration: string | null;   // RFC2445, recurring rows carry this instead of dtend
  allDay: boolean;
  rrule: string | null;
  calendarSyncId: string | null;
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
};

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
