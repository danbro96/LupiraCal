import { wins } from '@danbro96/lupira-sync-core/lww';
import {
  applyOccurrenceChange, continuedParticipationId, followDeviations, hasSeriesOccurrence, overrideFor, splitSeries,
} from '@lupira/cal-domain/seriesOccurrences';
import type {
  ContactDoc, ContactGuards, ItemAttendee, ItemDoc, ItemGuards, ReachChannel, ResidencyDoc, SectionGuard, SocialProfile,
} from './docTypes';
import { emptyContactGuards, emptyItemGuards, ZERO_GUARD } from './docTypes';
import type { ClientOp, ContactCore, ItemCore, ResidencyFields } from './ops';

/** Client twins of the servers' section reducers: applying an op locally must land on the same state the
 *  server's Apply will produce for the same (occurredAt, commandId) — that is what makes the pull-time rebase
 *  (server base + pending ops replayed through these) converge with the server's eventual truth. Semantics
 *  mirror the REST contracts faithfully, including their warts (null = keep on non-sentinel fields; contact
 *  revise UNION-merges channels/tags). */

/** A doc and its section guards; null is absent or deleted, as the server tombstones it. */
export type MirrorItem = { doc: ItemDoc; guards: ItemGuards };
export type MirrorContact = { doc: ContactDoc; guards: ContactGuards };
export type MirrorResidency = { doc: ResidencyDoc; guards: null };

export function applyItemOp(state: MirrorItem | null, op: ClientOp): MirrorItem | null {
  switch (op.kind) {
    case 'item.create': {
      if (state) return state;   // idempotent hit, like the server's SourceKey dedup
      const { availability, placeId, location, locationUnresolved, ...core } = op.core;
      const label = location?.trim() || null;
      const doc: ItemDoc = {
        ...core,
        ...(placeId && !locationUnresolved ? { placeId, locationLabel: label } : {}),
        ...(locationUnresolved && label ? { placeId: null, locationLabel: label } : {}),
        id: op.itemId,
        isAllDay: op.core.isAllDay ?? false,
        calendars: [{ calendarId: op.calendarId, status: 'Accepted' }],
        ...(availability ? { details: { presence: { status: availability } } } : {}),
      };
      const guards = emptyItemGuards();
      guards.core = { ts: op.occurredAt, cmd: op.commandId };
      guards.filing = { [op.calendarId]: { ts: op.occurredAt, cmd: op.commandId } };
      return { doc, guards };
    }
    case 'item.revise': {
      if (!state) return state;
      const g = state.guards.core;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        ...state,
        doc: mergeItemCore(state.doc, op.core),
        guards: { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'item.metadata': {
      if (!state) return state;
      const g = state.guards.metadata;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      const metadata = { ...(state.doc.metadata ?? {}), ...op.patch };
      return {
        ...state,
        doc: { ...state.doc, metadata },
        guards: { ...state.guards, metadata: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'item.delete':
      return null;
    case 'item.file':
    case 'item.unfile': {
      if (!state) return state;
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
      if (!state) return state;
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
      if (!state) return state;
      const attendees = (state.doc.attendees ?? []).filter((a) => a.contactId !== op.contactId);
      return { ...state, doc: { ...state.doc, attendees } };
    }
    case 'item.respond': {
      if (!state) return state;
      const attendees = state.doc.attendees ?? [];
      if (!attendees.some((a) => a.contactId === op.contactId)) return state;
      return { ...state, doc: { ...state.doc, attendees: attendees.map((a) => (a.contactId === op.contactId ? { ...a, status: op.status } : a)) } };
    }
    // Guarded per participation like the server; an invite still in the outbox has no id to guard yet.
    case 'item.reminder': {
      if (!state) return state;
      const attendees = state.doc.attendees ?? [];
      const at = attendees.findIndex((a) => a.contactId === op.contactId);
      if (at < 0) return state;
      const key = attendees[at].participationId;
      const g = key ? state.guards.reminders?.[key] : undefined;
      if (g && !wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      const reminder = op.reminder.mode === 'Default' ? null : op.reminder;
      return {
        doc: { ...state.doc, attendees: attendees.map((a, i) => (i === at ? { ...a, reminder } : a)) },
        guards: key
          ? { ...state.guards, reminders: { ...state.guards.reminders, [key]: { ts: op.occurredAt, cmd: op.commandId } } }
          : state.guards,
      };
    }
    // Per-occurrence edits share the core guard, as on the server; a change keeps the occurrence's location label.
    case 'item.occurrence': {
      if (!state || !hasSeriesOccurrence(state.doc, op.originalStart)) return state;
      const g = state.guards.core;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      const edit = op.edit.kind === 'change'
        ? { ...op.edit, change: { ...op.edit.change, locationLabel: overrideFor(state.doc, op.originalStart)?.locationLabel ?? null } }
        : op.edit;
      return {
        doc: { ...state.doc, ...applyOccurrenceChange(state.doc, op.originalStart, edit) },
        guards: { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'item.occurrence.restore': {
      if (!state || !hasSeriesOccurrence(state.doc, op.originalStart)) return state;
      const at = Date.parse(op.originalStart);
      const changed = !!overrideFor(state.doc, op.originalStart) || (state.doc.excludedOccurrences ?? []).some((x) => Date.parse(x) === at);
      const g = state.guards.core;
      if (!changed || !wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        doc: { ...state.doc, ...applyOccurrenceChange(state.doc, op.originalStart, { kind: 'restore' }) },
        guards: { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    // At the first occurrence there is nothing before it: the whole series changes or goes.
    case 'item.split': {
      if (!state) return state;
      const g = state.guards.core;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      const guards = { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } };
      const split = splitSeries(state.doc, op.originalStart);
      if (!split) return op.core ? { doc: mergeItemCore(state.doc, op.core), guards } : null;
      const { recurrenceRule, excludedOccurrences, extraOccurrences, occurrenceOverrides } = split.earlier;
      return { doc: { ...state.doc, recurrenceRule, excludedOccurrences, extraOccurrences, occurrenceOverrides }, guards };
    }
    case 'item.continue':
      return state ?? op.state;
    default:
      return state;
  }
}

/** The series a split at `originalStart` starts, as cal-api builds it: the original's fields, calendars, attendees (each
 *  participation under its continued id) and payloads over the following part, revised with `core`, every section
 *  stamped with the split. Null when there is nothing before `originalStart` to split from. */
export function continuationOf(original: MirrorItem, newItemId: string, originalStart: string, core: ItemCore, split: SectionGuard): MirrorItem | null {
  const parts = splitSeries(original.doc, originalStart);
  if (!parts) return null;
  const continued = (participationId: string) => (participationId ? continuedParticipationId(newItemId, participationId) : '');
  const calendars = original.doc.calendars.filter((m) => m.status !== 'Removed');
  const attendees = original.doc.attendees?.map((a) => ({ ...a, participationId: continued(a.participationId) }));
  const reminders = original.guards.reminders
    && Object.fromEntries(Object.entries(original.guards.reminders).map(([id, g]) => [continued(id), g]));
  const doc: ItemDoc = {
    ...original.doc, ...parts.following, id: newItemId, continuesItemId: original.doc.id, calendars, ...(attendees ? { attendees } : {}),
  };
  const hasMetadata = Object.keys(original.doc.metadata ?? {}).length > 0;
  return {
    doc: mergeItemCore(doc, core),
    guards: {
      core: split,
      metadata: hasMetadata ? split : ZERO_GUARD,
      payload: original.doc.prompt != null || original.doc.action != null ? split : ZERO_GUARD,
      filing: Object.fromEntries(calendars.map((m) => [m.calendarId, split])),
      ...(reminders ? { reminders } : {}),
    },
  };
}

/** The totalized PUT's merge: sentinel-backed fields land verbatim; title/description/status/category/tags/
 *  parent keep the current value when the op carries null (the REST contract has no clear for them). A moved series
 *  takes its bound and per-occurrence changes along. */
function mergeItemCore(doc: ItemDoc, core: ItemCore): ItemDoc {
  const next: ItemDoc = {
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
    ...(core.locationUnresolved ? { placeId: null, locationLabel: core.location?.trim() || null } : core.placeId === undefined ? {} : {
      placeId: core.placeId,
      // The server keeps the label when the place is unchanged and nothing new is sent.
      locationLabel: core.location != null
        ? core.location.trim() || null
        : (core.placeId === doc.placeId ? doc.locationLabel : null),
    }),
  };
  return { ...next, ...followDeviations(doc, next) };
}

export function applyContactOp(state: MirrorContact | null, op: ClientOp): MirrorContact | null {
  switch (op.kind) {
    case 'contact.create': {
      if (state) return state;
      const doc: ContactDoc = { id: op.contactId, addressBookId: op.addressBookId, ...op.core };
      const guards = emptyContactGuards();
      guards.core = { ts: op.occurredAt, cmd: op.commandId };
      return { doc, guards };
    }
    case 'contact.revise': {
      if (!state) return state;
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
      if (!state) return state;
      const g = state.guards.core;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        ...state,
        doc: { ...state.doc, channels: normalizeChannels(op.channels) },
        guards: { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'contact.tags': {
      if (!state) return state;
      const g = state.guards.core;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        ...state,
        doc: { ...state.doc, tags: normalizeTags(op.tags) },
        guards: { ...state.guards, core: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'contact.profiles': {
      if (!state) return state;
      const g = state.guards.profiles;
      if (!wins(op.occurredAt, op.commandId, g.ts, g.cmd)) return state;
      return {
        ...state,
        doc: { ...state.doc, profiles: normalizeProfiles(op.profiles) },
        guards: { ...state.guards, profiles: { ts: op.occurredAt, cmd: op.commandId } },
      };
    }
    case 'contact.delete':
      return null;
    default:
      return state;
  }
}

// Residencies carry no section guards: their ops replay in outbox order, so the last one queued wins.
export function applyResidencyOp(state: MirrorResidency | null, op: ClientOp): MirrorResidency | null {
  switch (op.kind) {
    case 'contact.residency.start':
      if (state) return state;
      return { doc: { id: op.residencyId, contactId: op.contactId, ...stated(op.residency) }, guards: null };
    case 'contact.residency.revise':
      if (!state) return state;
      return { ...state, doc: { ...state.doc, ...stated(op.residency) } };
    case 'contact.residency.moveOut':
      if (!state) return state;
      return { ...state, doc: { ...state.doc, movedOut: op.movedOut } };
    case 'contact.residency.remove':
      return null;
    default:
      return state;
  }
}

function stated(r: ResidencyFields): ResidencyFields {
  return { placeId: r.placeId, type: r.type, label: r.label?.trim() || null, movedIn: r.movedIn ?? null, movedOut: r.movedOut ?? null };
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
