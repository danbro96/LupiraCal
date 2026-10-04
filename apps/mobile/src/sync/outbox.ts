import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import * as mirror from '../data/mirror';
import { nextAttemptDelayMs, PARK_AFTER_ATTEMPTS } from '../domain/backoff';
import type { Horizon } from '../domain/materialize';
import { birthdayRows, monthKeyOf, occurrenceRowsForItem } from '../domain/materialize';
import { applyContactOp, applyItemOp } from '../domain/mirrorReducers';
import type { ClientOp } from '../domain/ops';
import { aggregateIdOf, domainOf } from '../domain/ops';
import { classifyReplayError } from '../domain/replayError';
import { invalidateContacts, invalidateItems, invalidateMonthKeys, invalidateOutbox } from './reactivity';
import { replayOp } from './replayOp';
import { useSyncStatus } from './syncStatus';

/** Push side of the engine. Enqueue = ONE exclusive transaction covering the optimistic mirror write, the
 *  occurrence re-materialization, and the outbox insert — all-or-nothing (the tasks app's non-exclusive
 *  enqueue is the defect this design exists to fix). Drain = serialized, single-flight, with queue-level
 *  backoff (next_attempt_at), park-after-N, and the causal hold (a parked op blocks later ops on the same
 *  aggregate so a dead create can't 404-cascade its children). */

export type OutboxDeps = {
  replay: (op: ClientOp) => Promise<void>;
  now: () => Date;
  rand: () => number;
};

const realDeps: OutboxDeps = { replay: replayOp, now: () => new Date(), rand: Math.random };

export async function enqueue(db: Db, ops: ClientOp[], horizon: Horizon, deps: Partial<OutboxDeps> = {}): Promise<void> {
  const monthKeys = new Set<string>();
  let contactsTouched = false;
  let itemsTouched = false;

  await db.exclusive(async (tx) => {
    for (const op of ops) {
      const id = aggregateIdOf(op);
      if (domainOf(op) === 'cal') {
        const before = await mirror.loadItem(tx, id);
        const after = applyItemOp(before, op);
        if (after) {
          const rows = occurrenceRowsForItem(after.doc, after.deleted, horizon);
          for (const r of [...rows, ...(before ? occurrenceRowsForItem(before.doc, before.deleted, horizon) : [])])
            monthKeys.add(monthKeyOf(r.startDay));
          await mirror.saveItem(tx, after, rows);
          itemsTouched = true;
        }
      } else {
        const before = await mirror.loadContact(tx, id);
        const after = applyContactOp(before, op);
        if (after) {
          await mirror.saveContact(tx, after, birthdayRows(after.doc, after.deleted, horizon));
          contactsTouched = true;
        }
      }
      await mirror.insertOp(tx, op);
    }
  });

  invalidateMonthKeys(monthKeys);
  if (contactsTouched) invalidateContacts();
  if (itemsTouched) invalidateItems();
  await refreshCounts(db);
  void drain(db, deps);
}

// Single-flight: concurrent triggers await the same run.
let draining: Promise<void> | null = null;

export function drain(db: Db, deps: Partial<OutboxDeps> = {}): Promise<void> {
  draining ??= runDrain(db, { ...realDeps, ...deps }).finally(() => {
    draining = null;
  });
  return draining;
}

async function runDrain(db: Db, deps: OutboxDeps): Promise<void> {
  for (;;) {
    const row = await db.first<mirror.OutboxRow | null>(
      `SELECT * FROM outbox o
       WHERE o.status = 'pending'
         AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?)
         AND NOT EXISTS (
           SELECT 1 FROM outbox p
           WHERE p.aggregate_id = o.aggregate_id AND p.status = 'parked' AND p.seq < o.seq)
       ORDER BY o.seq LIMIT 1`,
      [deps.now().toISOString()],
    );
    if (!row) break;

    const op = mirror.opOfRow(row);
    try {
      await deps.replay(op);
      await db.exclusive((tx) => mirror.deleteOp(tx, row.seq));
      useSyncStatus.getState().set({ serverReachable: true, lastError: null });
      useSyncStatus.getState().bumpProgress('push', 1);
    } catch (e) {
      const decision = classifyReplayError(e);
      const park = decision.outcome === 'park' || row.attempts + 1 >= PARK_AFTER_ATTEMPTS;
      const nextAttemptAt = decision.outcome === 'retry' && !park
        ? new Date(deps.now().getTime() + nextAttemptDelayMs(row.attempts + 1, deps.rand)).toISOString()
        : null;
      if (decision.outcome !== 'pause')
        await db.exclusive((tx) => mirror.markFailure(tx, row.seq, park, nextAttemptAt, decision.reason));
      useSyncStatus.getState().set({
        serverReachable: decision.outcome !== 'retry' ? useSyncStatus.getState().serverReachable : false,
        lastError: decision.reason,
      });
      if (decision.stop) break;
    }
  }
  await refreshCounts(db);
}

export async function retryParked(db: Db, deps: Partial<OutboxDeps> = {}): Promise<void> {
  await db.exclusive(async (tx) => {
    for (const row of await mirror.listParked(tx)) await mirror.requeueParked(tx, row.seq);
  });
  await refreshCounts(db);
  void drain(db, deps);
}

export async function retryOne(db: Db, seq: number, deps: Partial<OutboxDeps> = {}): Promise<void> {
  await db.exclusive((tx) => mirror.requeueParked(tx, seq));
  await refreshCounts(db);
  void drain(db, deps);
}

/** Discard = drop the op AND roll its optimistic effect back to server truth (the tasks app left the mirror
 *  lying until the next pull). The caller re-fetches the aggregate; here we just remove the row. */
export async function discardParked(db: Db, seq: number): Promise<{ domain: 'cal' | 'contact'; aggregateId: string } | null> {
  const target = await db.exclusive(async (tx) => {
    const row = await tx.first<mirror.OutboxRow>('SELECT * FROM outbox WHERE seq = ?', [seq]);
    if (!row) return null;
    await mirror.deleteOp(tx, seq);
    return { domain: row.domain as 'cal' | 'contact', aggregateId: row.aggregate_id };
  });
  await refreshCounts(db);
  return target;
}

async function refreshCounts(db: Db): Promise<void> {
  const counts = await mirror.outboxCounts(db);
  useSyncStatus.getState().set(counts);
  invalidateOutbox();
}
