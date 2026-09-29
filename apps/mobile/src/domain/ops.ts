import { v7 as uuidv7 } from 'uuid';
import type { ContactDoc, ItemDoc, ReachChannel, SocialProfile } from './docTypes';

/** The offline command vocabulary — one op per replayable REST write. Ops are enqueued transactionally with
 *  their optimistic mirror effect and replayed with `Idempotency-Key: commandId` + `occurredAt`, so a
 *  redelivery is a server no-op and a stale one loses its section's LWW instead of clobbering.
 *  `envelope_version` (on the outbox row) versions this shape: migrations translate old envelopes, never drop. */

export const OP_ENVELOPE_VERSION = 1;

type Base = { commandId: string; occurredAt: string };

/** Desired core-section state for a calendar item (whole-section write — PUT with every sentinel set).
 *  null on title/description/status/category/tags means "keep" (the REST contract has no clear for those).
 *  `placeId` undefined = keep (writers that can't see places, like the calendar bridge), null = clear;
 *  `location` is the label stored with it. */
export type ItemCore = Pick<ItemDoc,
  'title' | 'description' | 'status' | 'isAllDay' | 'startsAt' | 'endsAt' | 'startDate' | 'endDate'
  | 'startTimezone' | 'endTimezone' | 'recurrenceRule' | 'category' | 'tags' | 'parentItemId'> & {
  /** Create-only: availability-calendar entries carry their presence status (details.presence.status
   *  server-side). Ignored by revise — details have their own endpoints. */
  availability?: string | null;
  placeId?: string | null;
  location?: string | null;
};

/** Contact fields as ReviseContact interprets them: name/notes/etc null = keep; channels and tags UNION-merge
 *  (the wholesale ops below are the removing counterparts, mirroring the REST surface). */
export type ContactCore = Pick<ContactDoc,
  'givenName' | 'middleName' | 'familyName' | 'nickname' | 'displayNameFormat' | 'kind'
  | 'channels' | 'birthday' | 'tags' | 'notes' | 'pronouns'>;

export type ClientOp = Base & (
  | { kind: 'item.create'; itemId: string; sourceKey: string; calendarId: string; core: ItemCore }
  | { kind: 'item.revise'; itemId: string; core: ItemCore }
  | { kind: 'item.metadata'; itemId: string; patch: Record<string, unknown> }
  | { kind: 'item.delete'; itemId: string }
  | { kind: 'item.file'; itemId: string; calendarId: string; entryStatus: 'accepted' | 'proposed' }
  | { kind: 'item.unfile'; itemId: string; calendarId: string }
  | { kind: 'item.invite'; itemId: string; contactIds: string[] }
  | { kind: 'item.uninvite'; itemId: string; contactId: string }
  | { kind: 'contact.create'; contactId: string; sourceKey: string; addressBookId: string; core: ContactCore }
  | { kind: 'contact.revise'; contactId: string; core: ContactCore }
  | { kind: 'contact.channels'; contactId: string; channels: ReachChannel[] }
  | { kind: 'contact.tags'; contactId: string; tags: string[] }
  | { kind: 'contact.profiles'; contactId: string; profiles: SocialProfile[] }
  | { kind: 'contact.delete'; contactId: string }
);

export type OpKind = ClientOp['kind'];

export function stamp(): Base {
  return { commandId: uuidv7(), occurredAt: new Date().toISOString() };
}

export function aggregateIdOf(op: ClientOp): string {
  return 'itemId' in op ? op.itemId : op.contactId;
}

export function domainOf(op: ClientOp): 'cal' | 'contact' {
  return op.kind.startsWith('item.') ? 'cal' : 'contact';
}

/** Total over the union — adding an op kind without a user-facing label is a compile error. */
export const OP_LABELS: Record<OpKind, string> = {
  'item.create': 'Create event',
  'item.revise': 'Edit event',
  'item.metadata': 'Edit event metadata',
  'item.delete': 'Delete event',
  'item.file': 'File into calendar',
  'item.unfile': 'Remove from calendar',
  'item.invite': 'Invite to event',
  'item.uninvite': 'Remove from event',
  'contact.create': 'Create contact',
  'contact.revise': 'Edit contact',
  'contact.channels': 'Edit contact channels',
  'contact.tags': 'Edit contact tags',
  'contact.profiles': 'Edit contact profiles',
  'contact.delete': 'Delete contact',
};
