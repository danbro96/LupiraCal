import { resolveApiUrl } from '../data/api/apiUrl';
import { getDb } from '../data/db/expoDb';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { clearDeviceCredentials, loadDevice } from '../data/locationDevice';
import {
  deferFix, deleteFixes, deleteFixesUpTo, ensureSeqAbove, pendingFixes, pruneExpired, trimToCap,
} from '../data/locationQueue';
import { loadTrackingSettings } from '../data/locationSettings';
import type { LocationFix } from '../domain/locationFix';
import { RETENTION_DAYS, receiptIsCoherent, rejectDisposition } from '../domain/locationFix';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { DeviceRevokedError, MAX_BATCH_LINES, fetchCursor, postFixes, type IngestReceipt } from './locationIngest';
import { useTrackingStatus } from './locationTrackingStatus';

/** Drains the GPS fix queue to location-api. Single-flight like the outbox and the photo uploader.
 *
 *  Reconciliation rule: the receipt reports counts, and `rejects` names the individual seqs that
 *  failed. Everything submitted is therefore either accepted (insert or duplicate — both mean the
 *  server HAS it) or explicitly rejected, so we delete the whole batch except the rows whose reject
 *  reason could still succeed later. Duplicates must be deleted, not retried: they are already stored. */

/** Well under the server's 10k line cap — a smaller batch bounds the retry cost on a flaky link and
 *  keeps the request body a few hundred KB. */
const BATCH_SIZE = 1_000;
/** Weeks offline at driving cadence is ~86k rows/month; the queue needs a bound, not unbounded growth. */
const QUEUE_CAP_ROWS = 250_000;

let draining: Promise<void> | null = null;

export function runLocationUpload(dbOverride?: Db): Promise<void> {
  draining ??= drainOnce(dbOverride).finally(() => {
    draining = null;
  });
  return draining;
}

async function drainOnce(dbOverride?: Db): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const device = await loadDevice();
  if (!device) return;

  const settings = await loadTrackingSettings(db);
  if (!settings.enabled) return;

  const status = useTrackingStatus.getState();
  const now = Date.now();

  // Housekeeping first: rows past the server's retention can never be accepted, and the queue needs
  // a ceiling regardless.
  await db.exclusive(async (tx) => {
    await pruneExpired(tx, new Date(now - RETENTION_DAYS * 86_400_000).toISOString());
    await trimToCap(tx, QUEUE_CAP_ROWS);
  });

  try {
    for (;;) {
      const nowIso = new Date().toISOString();
      const batch = await db.exclusive((tx) => pendingFixes(tx, nowIso, Math.min(BATCH_SIZE, MAX_BATCH_LINES)));
      if (batch.length === 0) break;

      const receipt = await postFixes(await resolveApiUrl(), device.apiKey, batch);
      const outcome = classifyReceipt(batch, receipt, Date.now());

      if (outcome.kind === 'paused') {
        // The batch was discarded unread, so nothing may be deleted and highWaterSeq means "no info".
        status.set({ serverPaused: true });
        logDebug('location', 'ingest paused server-side — holding the queue');
        return;
      }
      if (outcome.kind === 'retain') {
        status.set({ lastError: `Upload held (${outcome.why})` });
        logDebug('location', `batch retained: ${outcome.why}`);
        return;
      }
      status.set({ serverPaused: false });

      await db.exclusive(async (tx) => {
        await deleteFixes(tx, outcome.acked);
        for (const d of outcome.deferred) await deferFix(tx, d.seq, d.untilIso);
        // Rows the server already had but this receipt never mentioned — the "POST landed, response
        // lost to an app kill" case. Safe because the drain is single-flight and strictly seq-ordered.
        if (receipt.highWaterSeq != null) await deleteFixesUpTo(tx, receipt.highWaterSeq);
      });
      status.set({ lastUploadAt: new Date().toISOString(), lastError: null });
      await status.refresh(db);

      logDebug('location', `uploaded ${receipt.inserted} (+${receipt.duplicates} dup, ${receipt.rejected} rejected)`);

      // A pass that settled nothing would loop forever on the same rows.
      if (outcome.acked.length === 0 && outcome.deferred.length === 0) return;
    }
  } catch (e) {
    if (e instanceof DeviceRevokedError) {
      // The device was retired server-side. Retrying can only 401 again; forget the credentials so
      // the UI can offer a clean re-registration.
      await clearDeviceCredentials();
      status.set({ recording: false, lastError: e.message });
      logDebug('location', 'device revoked — credentials cleared');
      return;
    }
    status.set({ lastError: String(e) });
    logDebug('location', `upload failed: ${String(e)}`);
  }
}

export type BatchOutcome =
  | { kind: 'paused' }
  | { kind: 'retain'; why: string }
  | { kind: 'settled'; acked: number[]; deferred: { seq: number; untilIso: string }[] };

/** Turns a receipt into "what may I delete".
 *
 *  The key rule: `inserted` and `duplicates` BOTH mean the server durably holds the row, and the
 *  receipt only names rows at the reject level — so everything submitted and not explicitly rejected
 *  is settled. Duplicates must be deleted, never retried; they are already stored. */
export function classifyReceipt(sent: LocationFix[], receipt: IngestReceipt, now: number): BatchOutcome {
  if (receipt.paused) return { kind: 'paused' };
  // The server stopped reading partway, so an unknown suffix was never parsed and no per-line result
  // covers it. Re-sending the whole batch is free (the prefix returns as duplicates); guessing is not.
  if (receipt.rejects.some((r) => r.reason === 'batch_too_large')) return { kind: 'retain', why: 'batch_too_large' };
  // A body mangled in transit would otherwise read as a clean ack and silently destroy the batch.
  if (!receiptIsCoherent(sent.length, receipt)) return { kind: 'retain', why: 'accounting_mismatch' };

  const bySeq = new Map(sent.map((f) => [f.seq, f]));
  const acked: number[] = [];
  const deferred: { seq: number; untilIso: string }[] = [];
  const held = new Set<number>();

  for (const reject of receipt.rejects) {
    if (reject.seq == null) continue;   // unattributable rejects are all permanent reasons — let them settle
    const fix = bySeq.get(reject.seq);
    const disposition = rejectDisposition(reject.reason, fix?.ts ?? '', now);
    if (disposition === 'drop') continue;            // settles below, deleted with the acked rows
    if (disposition === 'retain') { held.add(reject.seq); continue; }
    deferred.push({ seq: reject.seq, untilIso: disposition.deferUntil });
    held.add(reject.seq);
  }

  for (const fix of sent) if (!held.has(fix.seq)) acked.push(fix.seq);
  return { kind: 'settled', acked, deferred };
}

/** Aligns the local seq counter with the server after a reinstall (SecureStore kept the key, the
 *  queue did not) and drops anything the server already holds. Cheap enough to run at tracking start. */
export async function reconcileCursor(dbOverride?: Db): Promise<void> {
  const device = await loadDevice();
  if (!device) return;
  const db = dbOverride ?? (await getDb());
  try {
    const cursor = await fetchCursor(await resolveApiUrl(), device.apiKey);
    if (cursor.lastSeq == null) return;
    await db.exclusive(async (tx) => {
      await deleteFixesUpTo(tx, cursor.lastSeq!);
      await ensureSeqAbove(tx, cursor.lastSeq!);
    });
    await useTrackingStatus.getState().refresh(db);
  } catch (e) {
    if (e instanceof DeviceRevokedError) {
      await clearDeviceCredentials();
      return;
    }
    logDebug('location', `cursor reconcile failed: ${String(e)}`);
  }
}
