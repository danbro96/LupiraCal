import { getChanges as calGetChanges } from '@lupira/cal-api/fetch/cal';
import { getSyncContainers as calGetContainers } from '@lupira/cal-api/fetch/cal';
import { contactGetChanges, contactGetSyncContainers as contactGetContainers, getMe } from '@lupira/cal-api/fetch/contact';
import type { Db, Tx } from '../data/db/types';
import { saveMyContactId } from '../data/me';
import * as mirror from '../data/mirror';
import type { ContactDoc, ContactGuards, ItemDoc, ItemGuards } from '../domain/docTypes';
import type { Horizon } from '../domain/materialize';
import { birthdayRows, monthKeyOf, occurrenceRowsForItem } from '../domain/materialize';
import type { MirrorContact, MirrorItem } from '../domain/mirrorReducers';
import { applyContactOp, applyItemOp } from '../domain/mirrorReducers';
import { ApiError } from '../domain/apiError';
import { toContactChangesPage, toItemChangesPage } from './docAdapters';
import { useSyncStatus } from './syncStatus';

/** Pull side of the engine: a paged delta loop that actually READS the cursor (the tasks app wrote and
 *  ignored it), applies tombstones, and — the critical part — rebases every changed aggregate through the
 *  pending (and parked) local ops so a fresh server base never clobbers un-pushed intent. Server guards seed
 *  the local per-section guards, so the rebase decides each section exactly as the server eventually will. */

export type ItemChange = { item: ItemDoc; guards: ItemGuards };
export type ContactChange = { contact: ContactDoc; guards: ContactGuards };
export type ChangesPage<TChange> = { cursor: string; hasMore: boolean; changed: TChange[]; deleted: string[] };

export type PullDeps = {
  calChanges(since: string | null): Promise<ChangesPage<ItemChange>>;
  contactChanges(since: string | null): Promise<ChangesPage<ContactChange>>;
  calContainers(): Promise<{ id: string }[]>;
  contactContainers(): Promise<{ addressBooks: { id: string }[]; groups: { id: string }[] }>;
  /** Your own contact id; absent in harnesses that don't model identity. */
  myContactId?(): Promise<string | null>;
  now(): Date;
};

export const realPullDeps: PullDeps = {
  calChanges: async (since) => {
    const r = await calGetChanges(since ? { since } : undefined);
    if (r.status !== 200) throw new ApiError(r.status, 'changes failed');
    return toItemChangesPage(r.data);
  },
  contactChanges: async (since) => {
    const r = await contactGetChanges(since ? { since } : undefined);
    if (r.status !== 200) throw new ApiError(r.status, 'changes failed');
    return toContactChangesPage(r.data);
  },
  calContainers: async () => {
    const r = await calGetContainers();
    if (r.status !== 200) throw new ApiError(r.status, 'containers failed');
    return r.data;
  },
  contactContainers: async () => {
    const r = await contactGetContainers();
    if (r.status !== 200) throw new ApiError(r.status, 'containers failed');
    return r.data;
  },
  myContactId: async () => {
    const r = await getMe();
    if (r.status !== 200) throw new ApiError(r.status, 'me failed');
    return r.data.contactId ?? null;
  },
  now: () => new Date(),
};

/** Returns whether any container changed. */
export async function pullContainers(db: Db, deps: PullDeps): Promise<boolean> {
  const [cal, contact] = [await deps.calContainers(), await deps.contactContainers()];
  let changed = false;
  await db.exclusive(async (tx) => {
    changed = (await mirror.replaceContainers(tx, 'calendars', cal)) || changed;
    changed = (await mirror.replaceContainers(tx, 'address_books', contact.addressBooks)) || changed;
    changed = (await mirror.replaceContainers(tx, 'contact_groups', contact.groups)) || changed;
  });
  return changed;
}

/** Returns whether your contact id changed. */
export async function pullMe(db: Db, deps: PullDeps): Promise<boolean> {
  if (!deps.myContactId) return false;
  return saveMyContactId(db, await deps.myContactId());
}

/** What a pull touched, for query invalidation. `changed` is separate from `monthKeys`: an aggregate
 *  with no occurrence in the horizon still changes its detail and list queries. */
export type PullResult = { monthKeys: Set<string>; changed: boolean };

export async function pullCal(db: Db, horizon: Horizon, deps: PullDeps): Promise<PullResult> {
  const monthKeys = new Set<string>();
  let changed = false;
  let cursor = await mirror.getCursor(db, 'cal');
  const full = cursor === null;
  const seen = new Set<string>();

  for (;;) {
    const page = await deps.calChanges(cursor);
    if (page.changed.length + page.deleted.length > 0) changed = true;
    await db.exclusive(async (tx) => {
      for (const change of page.changed) {
        seen.add(change.item.id);
        await rebaseItem(tx, change, horizon, monthKeys);
      }
      for (const id of page.deleted) await tombstoneItem(tx, id, horizon, monthKeys);
      await mirror.setCursor(tx, 'cal', page.cursor, full, deps.now().toISOString());
    });
    useSyncStatus.getState().bumpProgress('items', page.changed.length + page.deleted.length);
    cursor = page.cursor;
    if (!page.hasMore) break;
  }

  // Full sync = wholesale replace: anything the stream didn't mention is gone from the server. Local-only
  // aggregates with a pending create are the one exception — they haven't reached the server yet.
  if (full) {
    await db.exclusive(async (tx) => {
      const keep = await mirror.pendingCreateAggregates(tx);
      for (const id of await mirror.allItemIds(tx)) {
        if (seen.has(id) || keep.has(id)) continue;
        await collectItemMonths(tx, id, horizon, monthKeys);
        await mirror.removeItem(tx, id);
        changed = true;
      }
    });
  }
  return { monthKeys, changed };
}

export async function pullContacts(db: Db, horizon: Horizon, deps: PullDeps): Promise<PullResult> {
  const monthKeys = new Set<string>();
  let changed = false;
  let cursor = await mirror.getCursor(db, 'contact');
  const full = cursor === null;
  const seen = new Set<string>();

  for (;;) {
    const page = await deps.contactChanges(cursor);
    if (page.changed.length + page.deleted.length > 0) changed = true;
    await db.exclusive(async (tx) => {
      for (const change of page.changed) {
        seen.add(change.contact.id);
        await rebaseContact(tx, change, horizon, monthKeys);
      }
      for (const id of page.deleted) {
        await collectBirthdayMonths(tx, id, monthKeys);
        await mirror.removeContact(tx, id);
      }
      await mirror.setCursor(tx, 'contact', page.cursor, full, deps.now().toISOString());
    });
    useSyncStatus.getState().bumpProgress('contacts', page.changed.length + page.deleted.length);
    cursor = page.cursor;
    if (!page.hasMore) break;
  }

  if (full) {
    await db.exclusive(async (tx) => {
      const keep = await mirror.pendingCreateAggregates(tx);
      for (const id of await mirror.allContactIds(tx)) {
        if (seen.has(id) || keep.has(id)) continue;
        await collectBirthdayMonths(tx, id, monthKeys);
        await mirror.removeContact(tx, id);
        changed = true;
      }
    });
  }
  return { monthKeys, changed };
}

/** Server truth + pending local ops replayed through the reducer twin = the state the server will converge
 *  on once the outbox lands. Parked ops stay in the fold — they remain the user's intent until discarded. */
async function rebaseItem(tx: Tx, change: ItemChange, horizon: Horizon, monthKeys: Set<string>): Promise<void> {
  await collectItemMonths(tx, change.item.id, horizon, monthKeys);
  let state: MirrorItem | null = { doc: change.item, guards: change.guards, deleted: false };
  for (const row of await mirror.opsForAggregate(tx, change.item.id))
    state = applyItemOp(state, mirror.opOfRow(row)) ?? state;
  const rows = occurrenceRowsForItem(state!.doc, state!.deleted, horizon);
  for (const r of rows) monthKeys.add(monthKeyOf(r.startDay));
  await mirror.saveItem(tx, state!, rows);
}

async function rebaseContact(tx: Tx, change: ContactChange, horizon: Horizon, monthKeys: Set<string>): Promise<void> {
  await collectBirthdayMonths(tx, change.contact.id, monthKeys);
  let state: MirrorContact | null = { doc: change.contact, guards: change.guards, deleted: false };
  for (const row of await mirror.opsForAggregate(tx, change.contact.id))
    state = applyContactOp(state, mirror.opOfRow(row)) ?? state;
  const rows = birthdayRows(state!.doc, state!.deleted, horizon);
  for (const r of rows) monthKeys.add(monthKeyOf(r.startDay));
  await mirror.saveContact(tx, state!, rows);
}

/** Delete-wins: the row and its occurrences go. Pending ops for it are left to 404-park on replay — the
 *  Sync issues screen is where a user resurrects that intent deliberately. */
async function tombstoneItem(tx: Tx, id: string, horizon: Horizon, monthKeys: Set<string>): Promise<void> {
  await collectItemMonths(tx, id, horizon, monthKeys);
  await mirror.removeItem(tx, id);
}

async function collectItemMonths(tx: Tx, id: string, horizon: Horizon, monthKeys: Set<string>): Promise<void> {
  const existing = await mirror.loadItem(tx, id);
  if (!existing) return;
  for (const r of occurrenceRowsForItem(existing.doc, existing.deleted, horizon)) monthKeys.add(monthKeyOf(r.startDay));
}

async function collectBirthdayMonths(tx: Tx, id: string, monthKeys: Set<string>): Promise<void> {
  const rows = await tx.all<{ start_day: string }>(
    "SELECT start_day FROM occurrences WHERE source = 'birthday' AND source_id = ?", [id]);
  for (const r of rows) monthKeys.add(monthKeyOf(r.start_day));
}
