import {
  continuationId, hasSeriesOccurrence, isFirstOccurrence, occurrenceKey, type OccurrenceEdit,
} from '@lupira/cal-domain/seriesOccurrences';
import { v7 as uuidv7 } from 'uuid';
import { deterministicIdFor } from '../data/ids';
import { lineageRoot } from '../data/queries/itemLineage';
import type { ResidencyChange } from '../domain/addressRows';
import { Aggregate } from '../domain/aggregates';
import type { ItemDoc, ItemGuards, ParticipantReminder, ReachChannel, SocialProfile } from '../domain/docTypes';
import { residencyStreamKey } from '../domain/ids';
import { continuationOf, type MirrorItem } from '../domain/mirrorReducers';
import type { ClientOp, ContactCore, ItemCore, RsvpStatus } from '../domain/ops';
import { stamp } from '../domain/ops';
import { engine, readyDb } from '../sync/engine';
import { withHoldKeys } from '../sync/holdKeys';

/** The screens' entire write surface: build an op, enqueue it (optimistic mirror write + outbox row in one
 *  exclusive transaction), let the engine push it when the network allows. Creates mint a sourceKey and derive
 *  the server's deterministic id up front, so navigation targets the final id. */

const item = (itemId: string) => stamp(Aggregate.item, itemId);
const contact = (contactId: string) => stamp(Aggregate.contact, contactId);
const residency = (residencyId: string) => stamp(Aggregate.residency, residencyId);
const group = (groupId: string) => stamp(Aggregate.contactGroup, groupId);

async function submit(ops: ClientOp | ClientOp[]): Promise<void> {
  await engine.enqueue(await withHoldKeys(await readyDb(), [ops].flat()));
}

export async function createItem(calendarId: string, core: ItemCore): Promise<string> {
  const sourceKey = uuidv7();
  const itemId = await deterministicIdFor(sourceKey);
  await submit({ kind: 'item.create', itemId, sourceKey, calendarId, core, ...item(itemId) });
  return itemId;
}

/** One create per draft in one transaction; a draft's own sourceKey makes importing it again a no-op. */
export async function createItems(calendarId: string, drafts: { core: ItemCore; sourceKey?: string }[]): Promise<void> {
  const ops: ClientOp[] = [];
  for (const draft of drafts) {
    const sourceKey = draft.sourceKey ?? uuidv7();
    const itemId = await deterministicIdFor(sourceKey);
    ops.push({ kind: 'item.create', itemId, sourceKey, calendarId, core: draft.core, ...item(itemId) });
  }
  await engine.enqueue(ops);
}

export async function reviseItem(itemId: string, core: ItemCore): Promise<void> {
  await submit({ kind: 'item.revise', itemId, core, ...item(itemId) });
}

export async function mergeItemMetadata(itemId: string, patch: Record<string, unknown>): Promise<void> {
  await submit({ kind: 'item.metadata', itemId, patch, ...item(itemId) });
}

export async function deleteItem(itemId: string): Promise<void> {
  await submit({ kind: 'item.delete', itemId, ...item(itemId) });
}

export async function fileItem(itemId: string, calendarId: string, entryStatus: 'accepted' | 'proposed' = 'accepted'): Promise<void> {
  await submit({ kind: 'item.file', itemId, calendarId, entryStatus, ...item(itemId) });
}

export async function unfileItem(itemId: string, calendarId: string): Promise<void> {
  await submit({ kind: 'item.unfile', itemId, calendarId, ...item(itemId) });
}

export type ItemSave = {
  core: ItemCore;
  file: string[];
  unfile: string[];
  invite: string[];
  uninvite: string[];
  /** Invitees who accept on the spot — you. */
  accept?: string[];
  /** Your own reminder; it replays behind the invite that puts you on the event. */
  reminder?: { contactId: string; reminder: ParticipantReminder };
};

/** One editor save: the core write plus its filing and attendee diffs, enqueued as one transaction so a
 *  crash can't leave half of it. A create files into the first calendar and the rest follow as file ops. */
export async function saveItem(itemId: string | undefined, save: ItemSave): Promise<string> {
  const ops: ClientOp[] = [];
  let id = itemId;
  let files = save.file;
  if (!id) {
    const [calendarId, ...rest] = save.file;
    const sourceKey = uuidv7();
    id = await deterministicIdFor(sourceKey);
    ops.push({ kind: 'item.create', itemId: id, sourceKey, calendarId, core: save.core, ...item(id) });
    files = rest;
  } else {
    ops.push({ kind: 'item.revise', itemId: id, core: save.core, ...item(id) });
  }
  for (const calendarId of files) ops.push({ kind: 'item.file', itemId: id, calendarId, entryStatus: 'accepted', ...item(id) });
  for (const calendarId of save.unfile) ops.push({ kind: 'item.unfile', itemId: id, calendarId, ...item(id) });
  if (save.invite.length > 0) {
    const accept = save.accept?.filter((c) => save.invite.includes(c));
    ops.push({ kind: 'item.invite', itemId: id, contactIds: save.invite, ...(accept?.length ? { accept } : {}), ...item(id) });
  }
  for (const contactId of save.uninvite) ops.push({ kind: 'item.uninvite', itemId: id, contactId, ...item(id) });
  if (save.reminder) ops.push({ kind: 'item.reminder', itemId: id, ...save.reminder, ...item(id) });
  await submit(ops);
  return id;
}

/** Adds you to an event you're not on, already accepted — the detail screen's Join. */
export async function joinItem(itemId: string, myContactId: string): Promise<void> {
  await submit({ kind: 'item.invite', itemId, contactIds: [myContactId], accept: [myContactId], ...item(itemId) });
}

export async function inviteToItem(itemId: string, contactId: string): Promise<void> {
  await submit({ kind: 'item.invite', itemId, contactIds: [contactId], ...item(itemId) });
}

export async function setRsvp(itemId: string, contactId: string, status: RsvpStatus): Promise<void> {
  await submit({ kind: 'item.respond', itemId, contactId, status, ...item(itemId) });
}

export async function setReminder(itemId: string, contactId: string, reminder: ParticipantReminder): Promise<void> {
  await submit({ kind: 'item.reminder', itemId, contactId, reminder, ...item(itemId) });
}

/** Excludes or changes one occurrence; a change that leaves nothing different from the series restores it. False when
 *  the series no longer has that occurrence. */
export async function changeOccurrence(itemId: string, originalStart: string, edit: OccurrenceEdit): Promise<boolean> {
  const key = occurrenceKey(originalStart);
  const doc = (await engine.doc<ItemDoc, ItemGuards>(Aggregate.item, itemId))?.doc;
  if (!doc || !hasSeriesOccurrence(doc, key)) return false;
  if (edit.kind === 'restore') await restoreOccurrence(itemId, key);
  else await submit({ kind: 'item.occurrence', itemId, originalStart: key, edit, ...item(itemId) });
  return true;
}

export async function restoreOccurrence(itemId: string, originalStart: string): Promise<void> {
  await submit({ kind: 'item.occurrence.restore', itemId, originalStart: occurrenceKey(originalStart), ...item(itemId) });
}

export type SplitOutcome = { kind: 'split' | 'whole'; itemId: string } | { kind: 'stale' };

/** "This and following": the series ends before `originalStart` and a new one, known by id offline, continues it as
 *  `core`. From the first occurrence it is the whole series; stale when the series no longer splits there. */
export async function splitItem(itemId: string, originalStart: string, core: ItemCore): Promise<SplitOutcome> {
  const state = await engine.doc<ItemDoc, ItemGuards>(Aggregate.item, itemId);
  if (!state) return { kind: 'stale' };
  const key = occurrenceKey(originalStart);
  const sourceKey = uuidv7();
  const newItemId = continuationId(sourceKey);
  const holdKey = await lineageRoot(await readyDb(), itemId);
  const split: ClientOp = { kind: 'item.split', itemId, originalStart: key, newItemId, sourceKey, core, ...item(itemId), holdKey };
  const continuation = continuationOf(state, newItemId, key, core, { ts: split.occurredAt, cmd: split.commandId });
  if (!continuation) {
    if (!isFirstOccurrence(state.doc, key)) return { kind: 'stale' };
    await reviseItem(itemId, core);
    return { kind: 'whole', itemId };
  }
  await submit([
    split,
    { kind: 'item.continue', itemId: newItemId, continuesItemId: itemId, state: continuation, ...stamp(Aggregate.item, newItemId, split.occurredAt), holdKey },
  ]);
  return { kind: 'split', itemId: newItemId };
}

/** Deletes `originalStart` and every occurrence after it; from the first occurrence that is the whole series. */
export async function deleteFollowing(state: MirrorItem, originalStart: string): Promise<void> {
  const itemId = state.doc.id;
  if (!hasSeriesOccurrence(state.doc, originalStart)) return;
  if (isFirstOccurrence(state.doc, originalStart)) {
    await deleteItem(itemId);
    return;
  }
  await submit({ kind: 'item.split', itemId, originalStart: occurrenceKey(originalStart), newItemId: null, sourceKey: null, core: null, ...item(itemId) });
}

export async function createContact(addressBookId: string, core: ContactCore): Promise<string> {
  const sourceKey = uuidv7();
  const contactId = await deterministicIdFor(sourceKey);
  await submit({ kind: 'contact.create', contactId, sourceKey, addressBookId, core, ...contact(contactId) });
  return contactId;
}

export async function createContacts(addressBookId: string, drafts: { core: ContactCore; sourceKey?: string }[]): Promise<void> {
  const ops: ClientOp[] = [];
  for (const draft of drafts) {
    const sourceKey = draft.sourceKey ?? uuidv7();
    const contactId = await deterministicIdFor(sourceKey);
    ops.push({ kind: 'contact.create', contactId, sourceKey, addressBookId, core: draft.core, ...contact(contactId) });
  }
  await engine.enqueue(ops);
}

export async function reviseContact(contactId: string, core: ContactCore): Promise<void> {
  await submit({ kind: 'contact.revise', contactId, core, ...contact(contactId) });
}

export async function setContactChannels(contactId: string, channels: ReachChannel[]): Promise<void> {
  await submit({ kind: 'contact.channels', contactId, channels, ...contact(contactId) });
}

export async function setContactTags(contactId: string, tags: string[]): Promise<void> {
  await submit({ kind: 'contact.tags', contactId, tags, ...contact(contactId) });
}

export async function setContactProfiles(contactId: string, profiles: SocialProfile[]): Promise<void> {
  await submit({ kind: 'contact.profiles', contactId, profiles, ...contact(contactId) });
}

export async function deleteContact(contactId: string): Promise<void> {
  await submit({ kind: 'contact.delete', contactId, ...contact(contactId) });
}

/** A contact editor's address changes in one transaction; they replay behind the contact's own queued ops. */
export async function saveResidencies(contactId: string, changes: ResidencyChange[]): Promise<void> {
  const ops: ClientOp[] = [];
  for (const change of changes) {
    switch (change.kind) {
      case 'start': {
        const sourceKey = uuidv7();
        const residencyId = await deterministicIdFor(residencyStreamKey(contactId, sourceKey));
        ops.push({ kind: 'contact.residency.start', residencyId, contactId, sourceKey, residency: change.residency, ...residency(residencyId) });
        break;
      }
      case 'revise':
        ops.push({ kind: 'contact.residency.revise', residencyId: change.residencyId, contactId, residency: change.residency, ...residency(change.residencyId) });
        break;
      case 'moveOut':
        ops.push({ kind: 'contact.residency.moveOut', residencyId: change.residencyId, contactId, movedOut: change.movedOut, ...residency(change.residencyId) });
        break;
      case 'remove':
        ops.push({ kind: 'contact.residency.remove', residencyId: change.residencyId, contactId, ...residency(change.residencyId) });
    }
  }
  if (ops.length > 0) await engine.enqueue(ops);
}

export async function addToGroup(groupId: string, contactId: string): Promise<void> {
  await submit({ kind: 'contact.group.addMember', groupId, contactId, ...group(groupId) });
}

export async function removeFromGroup(groupId: string, contactId: string): Promise<void> {
  await submit({ kind: 'contact.group.removeMember', groupId, contactId, ...group(groupId) });
}
