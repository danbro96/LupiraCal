import { v7 as uuidv7 } from 'uuid';
import { getDb } from '../data/db/expoDb';
import { deterministicIdFor } from '../data/ids';
import type { ReachChannel, SocialProfile } from '../domain/docTypes';
import { currentHorizon } from '../domain/materialize';
import type { ClientOp, ContactCore, ItemCore } from '../domain/ops';
import { stamp } from '../domain/ops';
import { enqueue } from '../sync/outbox';

/** The screens' entire write surface: build an op, enqueue it (optimistic mirror write + outbox row in one
 *  exclusive transaction — outbox.ts), let the drain push it when the network allows. Creates mint a
 *  sourceKey and derive the server's deterministic id up front, so navigation targets the final id. */

async function submit(op: ClientOp): Promise<void> {
  await enqueue(await getDb(), [op], currentHorizon());
}

export async function createItem(calendarId: string, core: ItemCore): Promise<string> {
  const sourceKey = uuidv7();
  const itemId = await deterministicIdFor(sourceKey);
  await submit({ kind: 'item.create', itemId, sourceKey, calendarId, core, ...stamp() });
  return itemId;
}

export async function reviseItem(itemId: string, core: ItemCore): Promise<void> {
  await submit({ kind: 'item.revise', itemId, core, ...stamp() });
}

export async function mergeItemMetadata(itemId: string, patch: Record<string, unknown>): Promise<void> {
  await submit({ kind: 'item.metadata', itemId, patch, ...stamp() });
}

export async function deleteItem(itemId: string): Promise<void> {
  await submit({ kind: 'item.delete', itemId, ...stamp() });
}

export async function fileItem(itemId: string, calendarId: string, entryStatus: 'accepted' | 'proposed' = 'accepted'): Promise<void> {
  await submit({ kind: 'item.file', itemId, calendarId, entryStatus, ...stamp() });
}

export async function unfileItem(itemId: string, calendarId: string): Promise<void> {
  await submit({ kind: 'item.unfile', itemId, calendarId, ...stamp() });
}

export type ItemSave = {
  core: ItemCore;
  file: string[];
  unfile: string[];
  invite: string[];
  uninvite: string[];
  /** Invitees who accept on the spot — you. */
  accept?: string[];
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
    ops.push({ kind: 'item.create', itemId: id, sourceKey, calendarId, core: save.core, ...stamp() });
    files = rest;
  } else {
    ops.push({ kind: 'item.revise', itemId: id, core: save.core, ...stamp() });
  }
  for (const calendarId of files) ops.push({ kind: 'item.file', itemId: id, calendarId, entryStatus: 'accepted', ...stamp() });
  for (const calendarId of save.unfile) ops.push({ kind: 'item.unfile', itemId: id, calendarId, ...stamp() });
  if (save.invite.length > 0) {
    const accept = save.accept?.filter((c) => save.invite.includes(c));
    ops.push({ kind: 'item.invite', itemId: id, contactIds: save.invite, ...(accept?.length ? { accept } : {}), ...stamp() });
  }
  for (const contactId of save.uninvite) ops.push({ kind: 'item.uninvite', itemId: id, contactId, ...stamp() });
  await enqueue(await getDb(), ops, currentHorizon());
  return id;
}

/** Adds you to an event you're not on, already accepted — the detail screen's Join. */
export async function joinItem(itemId: string, myContactId: string): Promise<void> {
  await submit({ kind: 'item.invite', itemId, contactIds: [myContactId], accept: [myContactId], ...stamp() });
}

export async function createContact(addressBookId: string, core: ContactCore): Promise<string> {
  const sourceKey = uuidv7();
  const contactId = await deterministicIdFor(sourceKey);
  await submit({ kind: 'contact.create', contactId, sourceKey, addressBookId, core, ...stamp() });
  return contactId;
}

export async function reviseContact(contactId: string, core: ContactCore): Promise<void> {
  await submit({ kind: 'contact.revise', contactId, core, ...stamp() });
}

export async function setContactChannels(contactId: string, channels: ReachChannel[]): Promise<void> {
  await submit({ kind: 'contact.channels', contactId, channels, ...stamp() });
}

export async function setContactTags(contactId: string, tags: string[]): Promise<void> {
  await submit({ kind: 'contact.tags', contactId, tags, ...stamp() });
}

export async function setContactProfiles(contactId: string, profiles: SocialProfile[]): Promise<void> {
  await submit({ kind: 'contact.profiles', contactId, profiles, ...stamp() });
}

export async function deleteContact(contactId: string): Promise<void> {
  await submit({ kind: 'contact.delete', contactId, ...stamp() });
}
