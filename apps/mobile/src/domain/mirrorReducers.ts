import { wins } from '@danbro96/lupira-sync-core/lww';
import type { ContactDoc, ContactGuards, ItemAttendee, ItemDoc, ItemGuards, ReachChannel, SocialProfile } from './docTypes';
import { emptyContactGuards, emptyItemGuards } from './docTypes';
import type { ClientOp, ContactCore, ItemCore } from './ops';

/** Client twins of the servers' section reducers: applying an op locally must land on the same state the
 *  server's Apply will produce for the same (occurredAt, commandId) — that is what makes the pull-time rebase
 *  (server base + pending ops replayed through these) converge with the server's eventual truth. Semantics
 *  mirror the REST contracts faithfully, including their warts (null = keep on non-sentinel fields; contact
 *  revise UNION-merges channels/tags). */

export type MirrorItem = { doc: ItemDoc; guards: ItemGuards; deleted: boolean };
export type MirrorContact = { doc: ContactDoc; guards: ContactGuards; deleted: boolean };

export function applyItemOp(state: MirrorItem | null, op: ClientOp): MirrorItem | null {
  switch (op.kind) {
    case 'item.create': {
      if (state && !state.deleted) return state;   // idempotent hit, like the server's SourceKey dedup
      const { availability, placeId, location, ...core } = op.core;
      const doc: ItemDoc = {
        ...core,
        ...(placeId ? { placeId, locationLabel: location?.trim() || null } : {}),
        id: op.itemId,
        isAllDay: op.core.isAllDay ?? false,
        calendars: [{ calendarId: op.calendarId, status: 'Accepted' }],
        ...(availability ? { details: { presence: { status: availability } } } : {}),
      };
      const guards = emptyItemGuards();
      guards.core = { ts: op.occurredAt, cmd: op.commandId };
      guards.filing = { [op.calendarId]: { ts: op.occurredAt, cmd: op.commandId } };
      return { doc, guards, deleted: false };
    }
    case 'item.revise': {
      if (!state || state.deleted) return state;
      const g = state.guards.core;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        ...state,
        doc: mergeItemCore(state.doc, op.core),
        guards: { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'item.metadata': {
      if (!state || state.deleted) return state;
      const g = state.guards.metadata;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      const metadata = { ...(state.doc.metadata ?? {}), ...op.patch };
      return {
        ...state,
        doc: { ...state.doc, metadata },
        guards: { ...state.guards, metadata: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'item.delete': {
      if (!state) return state;
      return { ...state, deleted: true };   // absorbing, like the server tombstone
    }
    case 'item.file':
    case 'item.unfile': {
      if (!state || state.deleted) return state;
      const calId = op.calendarId;
      const g = state.guards.filing[calId];
      if (g && !wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      const status = op.kind === 'item.file'
        ? (op.entryStatus === 'accepted' ? 'Accepted' : 'Proposed')
        : 'Removed';
      const calendars = state.doc.calendars.some((m) => m.calendarId === calId)
        ? state.doc.calendars.map((m) => (m.calendarId === calId ? { ...m, status } : m))
        : [...state.doc.calendars, { calendarId: calId, status }];
      return {
        ...state,
        doc: { ...state.doc, calendars },
        guards: { ...state.guards, filing: { ...state.guards.filing, [calId]: { ts: op.occurredAt, cmd: op.commandId } } },
      };
    }
    // Participation carries no section guard server-side: invites and removals apply in outbox order.
    case 'item.invite': {
      if (!state || state.deleted) return state;
      const attendees = state.doc.attendees ?? [];
      const present = new Set(attendees.map((a) => a.contactId));
      const added: ItemAttendee[] = op.contactIds
        .filter((id, i, all) => !present.has(id) && all.indexOf(id) === i)
        .map((contactId) => ({
          participationId: '', contactId, role: 'RequiredParticipant', status: op.accept?.includes(contactId) ? 'Accepted' : 'NeedsAction',
        }));
      if (added.length === 0) return state;
      return { ...state, doc: { ...state.doc, attendees: [...attendees, ...added] } };
    }
    case 'item.uninvite': {
      if (!state || state.deleted) return state;
      const attendees = (state.doc.attendees ?? []).filter((a) => a.contactId !== op.contactId);
      return { ...state, doc: { ...state.doc, attendees } };
    }
    default:
      return state;
  }
}

/** The totalized PUT's merge: sentinel-backed fields land verbatim; title/description/status/category/tags/
 *  parent keep the current value when the op carries null (the REST contract has no clear for them). */
function mergeItemCore(doc: ItemDoc, core: ItemCore): ItemDoc {
  return {
    ...doc,
    title: core.title ?? doc.title,
    description: core.description ?? doc.description,
    status: core.status ?? doc.status,
    category: core.category ?? doc.category,
    tags: core.tags ?? doc.tags,
    parentItemId: core.parentItemId ?? doc.parentItemId,
    isAllDay: core.isAllDay ?? doc.isAllDay,
    startsAt: core.startsAt,
    endsAt: core.endsAt,
    startDate: core.startDate,
    endDate: core.endDate,
    startTimezone: core.startTimezone,
    endTimezone: core.endTimezone,
    recurrenceRule: core.recurrenceRule,
    ...(core.placeId === undefined ? {} : {
      placeId: core.placeId,
      // The server keeps the label when the place is unchanged and nothing new is sent.
      locationLabel: core.location != null
        ? core.location.trim() || null
        : (core.placeId === doc.placeId ? doc.locationLabel : null),
    }),
  };
}

export function applyContactOp(state: MirrorContact | null, op: ClientOp): MirrorContact | null {
  switch (op.kind) {
    case 'contact.create': {
      if (state && !state.deleted) return state;
      const doc: ContactDoc = { id: op.contactId, addressBookId: op.addressBookId, ...op.core };
      const guards = emptyContactGuards();
      guards.core = { ts: op.occurredAt, cmd: op.commandId };
      return { doc, guards, deleted: false };
    }
    case 'contact.revise': {
      if (!state || state.deleted) return state;
      const g = state.guards.core;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        ...state,
        doc: mergeContactCore(state.doc, op.core),
        guards: { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    // Channels and tags ride the same server event as core revisions, so they share the core guard.
    case 'contact.channels': {
      if (!state || state.deleted) return state;
      const g = state.guards.core;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        ...state,
        doc: { ...state.doc, channels: normalizeChannels(op.channels) },
        guards: { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'contact.tags': {
      if (!state || state.deleted) return state;
      const g = state.guards.core;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        ...state,
        doc: { ...state.doc, tags: normalizeTags(op.tags) },
        guards: { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'contact.profiles': {
      if (!state || state.deleted) return state;
      const g = state.guards.profiles;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        ...state,
        doc: { ...state.doc, profiles: normalizeProfiles(op.profiles) },
        guards: { ...state.guards, profiles: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'contact.delete': {
      if (!state) return state;
      return { ...state, deleted: true };
    }
    default:
      return state;
  }
}

/** ReviseContact's enrichment semantics: null = keep; channels/tags UNION onto existing (adds, never removes). */
function mergeContactCore(doc: ContactDoc, core: ContactCore): ContactDoc {
  return {
    ...doc,
    givenName: core.givenName ?? doc.givenName,
    middleName: core.middleName ?? doc.middleName,
    familyName: core.familyName ?? doc.familyName,
    nickname: core.nickname ?? doc.nickname,
    displayNameFormat: core.displayNameFormat ?? doc.displayNameFormat,
    kind: core.kind ?? doc.kind,
    birthday: core.birthday ?? doc.birthday,
    notes: core.notes ?? doc.notes,
    pronouns: core.pronouns ?? doc.pronouns,
    channels: unionChannels(doc.channels ?? [], core.channels ?? []),
    tags: unionTags(doc.tags ?? null, core.tags ?? null),
  };
}

function unionChannels(existing: ReachChannel[], incoming: ReachChannel[]): ReachChannel[] {
  const inc = normalizeChannels(incoming);
  if (inc.length === 0) return existing;
  const result = [...existing];
  const have = new Set(result.map((c) => `${c.medium}|${c.value.toLowerCase()}`));
  const preferredMedia = new Set(result.filter((c) => c.preferred).map((c) => c.medium));
  for (const ch of inc) {
    const key = `${ch.medium}|${ch.value.toLowerCase()}`;
    if (have.has(key)) continue;
    have.add(key);
    const preferred = ch.preferred && !preferredMedia.has(ch.medium);
    if (preferred) preferredMedia.add(ch.medium);
    result.push({ ...ch, preferred });
  }
  return result;
}

function unionTags(existing: string[] | null, incoming: string[] | null): string[] | null {
  if (!incoming || incoming.length === 0) return existing;
  if (!existing || existing.length === 0) return incoming;
  const seen = new Set(existing.map((t) => t.toLowerCase()));
  return [...existing, ...incoming.filter((t) => !seen.has(t.toLowerCase()))];
}

function normalizeChannels(channels: ReachChannel[]): ReachChannel[] {
  const out: ReachChannel[] = [];
  const seen = new Set<string>();
  const preferredMedia = new Set<string>();
  for (const c of channels) {
    const value = c.value.trim();
    if (!value) continue;
    const key = `${c.medium}|${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const preferred = c.preferred && !preferredMedia.has(c.medium);
    if (preferred) preferredMedia.add(c.medium);
    out.push({ ...c, value, preferred });
  }
  return out;
}

function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = raw.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

function normalizeProfiles(profiles: SocialProfile[]): SocialProfile[] {
  const out: SocialProfile[] = [];
  const seen = new Set<string>();
  for (const p of profiles) {
    const service = p.service.trim();
    const handle = p.handle.trim();
    if (!service || !handle) continue;
    const key = `${service}|${handle.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...p, service, handle });
  }
  return out;
}
