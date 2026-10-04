import { getItem } from '@lupira/cal-api/fetch/cal';
import { getContact } from '@lupira/cal-api/fetch/contact';
import NetInfo from '@react-native-community/netinfo';
import * as Sentry from '@sentry/react-native';
import { AppState } from 'react-native';
import { authPort } from '@danbro96/lupira-http/authPort';
import { getDb } from '../data/db/expoDb';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import { MIGRATIONS } from '../data/db/schema';
import * as mirror from '../data/mirror';
import { ApiError, isNetworkError } from '@danbro96/lupira-http/apiError';
import { emptyContactGuards, emptyItemGuards, type ContactDoc, type ItemDoc } from '../domain/docTypes';
import type { Horizon } from '../domain/materialize';
import { birthdayRows, currentHorizon, horizonDrifted, monthKeyOf, occurrenceRowsForItem } from '../domain/materialize';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { bridgePublish, drainBridgeInbox } from './bridge';
import { toContactDoc, toItemDoc } from './docAdapters';
import { discardParked, drain } from './outbox';
import type { PullDeps } from './pull';
import { pullCal, pullContacts, pullContainers, pullMe, pullPlaceEntries, pullRelationships, pullResidencies, realPullDeps } from './pull';
import { invalidateContacts, invalidateContainers, invalidateItems, invalidateMe, invalidateMonthKeys } from './reactivity';
import { useSyncStatus } from './syncStatus';

/** Orchestrator: push first (our writes carry LWW stamps, so order is about promptness, not correctness),
 *  then containers, then both delta pulls, then horizon upkeep. Coalesced — concurrent triggers share a run. */

let syncing: Promise<void> | null = null;

export function runSync(dbOverride?: Db, deps: PullDeps = realPullDeps): Promise<void> {
  syncing ??= run(dbOverride, deps).finally(() => {
    syncing = null;
  });
  return syncing;
}

async function run(dbOverride: Db | undefined, deps: PullDeps): Promise<void> {
  const status = useSyncStatus.getState();
  status.set({ syncing: true });
  try {
    const db = dbOverride ?? (await getDb());
    await migrate(db, MIGRATIONS);
    await authPort().refresh();

    // Stock-app edits captured by the bridge ride the same push as the app's own queued writes.
    await drainBridgeInbox(db);
    status.setPhase('push');
    await drain(db);

    const horizon = currentHorizon(deps.now());
    status.setPhase('containers');
    if (await pullContainers(db, deps)) invalidateContainers();
    // Identity only seeds "invite me" — a failing /me must not hold back the mirror.
    const meChanged = await pullMe(db, deps).catch((e: unknown) => {
      logDebug('sync', `me failed: ${String(e)}`);
      return false;
    });
    if (meChanged) invalidateMe();
    status.setPhase('items');
    const cal = await pullCal(db, horizon, deps);
    status.setPhase('contacts');
    const contacts = await pullContacts(db, horizon, deps);
    // Not short-circuited: each feed must advance its cursor every run.
    const feeds = [await pullRelationships(db, deps), await pullResidencies(db, deps), await pullPlaceEntries(db, deps)];
    // Only what the pull touched: an empty delta (most resumes) must not refetch every mounted query.
    invalidateMonthKeys([...cal.monthKeys, ...contacts.monthKeys]);
    if (contacts.changed || feeds.includes(true)) invalidateContacts();
    if (cal.changed) invalidateItems();

    await maintainHorizon(db, horizon);

    // Provider round-trip: push the freshly pulled mirror into the stock apps, and pick up any
    // stock-app edits the capture just found (their push rides enqueue's auto-drain).
    status.setPhase('bridge');
    await bridgePublish(db);
    await drainBridgeInbox(db);

    status.set({ serverReachable: true, lastError: null, lastSyncAt: deps.now().toISOString() });
    logDebug('sync', 'sync complete');
  } catch (e) {
    logDebug('sync', `sync failed: ${String(e)}`);
    // Offline is expected; anything else is invisible off the phone without this.
    if (!isNetworkError(e)) Sentry.captureException(e, { tags: { area: 'sync', phase: useSyncStatus.getState().progress?.phase ?? 'start' } });
    useSyncStatus.getState().set({
      serverReachable: !(e instanceof ApiError) || !isNetworkError(e),
      lastError: String(e),
    });
  } finally {
    useSyncStatus.getState().set({ syncing: false });
    useSyncStatus.getState().setPhase(null);
  }
}

/** Re-materializes every aggregate when the rolling window has drifted a month past the stored one, so old
 *  occurrences age out and new months appear without any server traffic. */
async function maintainHorizon(db: Db, horizon: Horizon): Promise<void> {
  const stored = await mirror.getMeta(db, 'horizon');
  const parsed = stored ? (JSON.parse(stored) as { start: string; end: string }) : null;
  if (parsed && !horizonDrifted({ start: new Date(parsed.start), end: new Date(parsed.end) }, horizon)) return;

  const monthKeys = new Set<string>();
  await db.exclusive(async (tx) => {
    for (const id of await mirror.allItemIds(tx)) {
      const state = await mirror.loadItem(tx, id);
      if (!state) continue;
      const rows = occurrenceRowsForItem(state.doc, state.deleted, horizon);
      for (const r of rows) monthKeys.add(monthKeyOf(r.startDay));
      await mirror.saveItem(tx, state, rows);
    }
    for (const id of await mirror.allContactIds(tx)) {
      const state = await mirror.loadContact(tx, id);
      if (!state) continue;
      const rows = birthdayRows(state.doc, state.deleted, horizon);
      for (const r of rows) monthKeys.add(monthKeyOf(r.startDay));
      await mirror.saveContact(tx, state, rows);
    }
    await mirror.setMeta(tx, 'horizon', JSON.stringify({ start: horizon.start.toISOString(), end: horizon.end.toISOString() }));
  });
  invalidateMonthKeys(monthKeys);
  logDebug('sync', 'horizon re-materialized');
}

/** Discard a parked op AND restore its aggregate to server truth — the optimistic write must not keep lying
 *  in the mirror (the tasks app left it until the next incidental pull). Guards reset to zero: the next
 *  delta pull re-seeds the real ones. */
export async function discardParkedAndRestore(seq: number, dbOverride?: Db): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const target = await discardParked(db, seq);
  if (!target) return;

  const horizon = currentHorizon();
  const monthKeys = new Set<string>();
  if (target.domain === 'cal') {
    let fetched: ItemDoc | null = null;
    try {
      const r = await getItem(target.aggregateId);
      if (r.status === 200) fetched = toItemDoc(r.data);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
    await db.exclusive(async (tx) => {
      if (!fetched) {
        await mirror.removeItem(tx, target.aggregateId);
        return;
      }
      const state = { doc: fetched, guards: emptyItemGuards(), deleted: false };
      const rows = occurrenceRowsForItem(state.doc, false, horizon);
      for (const r of rows) monthKeys.add(monthKeyOf(r.startDay));
      await mirror.saveItem(tx, state, rows);
    });
    invalidateItems();
  } else {
    let fetched: ContactDoc | null = null;
    try {
      const r = await getContact(target.aggregateId);
      if (r.status === 200) fetched = toContactDoc(r.data);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
    await db.exclusive(async (tx) => {
      if (!fetched) {
        await mirror.removeContact(tx, target.aggregateId);
        return;
      }
      const state = { doc: fetched, guards: emptyContactGuards(), deleted: false };
      const rows = birthdayRows(state.doc, false, horizon);
      for (const r of rows) monthKeys.add(monthKeyOf(r.startDay));
      await mirror.saveContact(tx, state, rows);
    });
    invalidateContacts();
  }
  invalidateMonthKeys(monthKeys);
}

/** Foreground triggers: app becomes active, connectivity returns, sign-in completes. (Post-enqueue drains
 *  are wired inside enqueue; the periodic background tick lives in backgroundTask.ts.) */
export function startSync(): () => void {
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') void runSync();
  });
  const net = NetInfo.addEventListener((state) => {
    if (state.isConnected) void runSync();
  });
  const offSignIn = authPort().onSignIn(() => void runSync());
  void runSync();
  return () => {
    appState.remove();
    net();
    offSignIn();
  };
}
