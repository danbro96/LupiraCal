import type { LocationFix, MotionActivity, LocationProvider } from '../domain/locationFix';
import type { Db, Tx } from '@danbro96/lupira-expo-sqlite/types';
import { getMeta, setMeta } from './mirror';

/** Row-level persistence for the GPS fix queue. Same contract as mirror.ts: every function takes a Tx.
 *  The queue is drain-and-delete — an acked fix is gone locally; the server is the archive. */

const SEQ_KEY = 'location.nextSeq';

type FixRow = {
  seq: number; ts: string; lat: number; lon: number;
  accuracy_m: number | null; altitude_m: number | null; heading_deg: number | null; speed_mps: number | null;
  activity: string; provider: string; battery_pct: number | null; is_moving: number; is_mock: number;
  next_attempt_at: string | null;
};

function toFix(row: FixRow): LocationFix {
  return {
    seq: row.seq,
    ts: row.ts,
    lat: row.lat,
    lon: row.lon,
    accuracyM: row.accuracy_m,
    altitudeM: row.altitude_m,
    headingDeg: row.heading_deg,
    speedMps: row.speed_mps,
    activity: row.activity as MotionActivity,
    provider: row.provider as LocationProvider,
    batteryPct: row.battery_pct,
    isMoving: row.is_moving === 1,
    isMock: row.is_mock === 1,
  };
}

/** Reserves the next `seq`. Monotonic across restarts because it lives in mirror_meta, and it must
 *  never go backwards: the server's key is (device, ts, seq), so a reused seq with a new ts silently
 *  double-inserts. Reserved inside the same transaction as the insert. */
export async function reserveSeq(tx: Tx): Promise<number> {
  const stored = await getMeta(tx, SEQ_KEY);
  const next = stored ? Number(stored) + 1 : 1;
  await setMeta(tx, SEQ_KEY, String(next));
  return next;
}

/** Highest seq ever handed out — the local counter, not what the server has acked. */
export async function currentSeq(db: Db): Promise<number> {
  const stored = await db.exclusive((tx) => getMeta(tx, SEQ_KEY));
  return stored ? Number(stored) : 0;
}

/** Fast-forwards the counter so the next fix lands above whatever the server already holds. Used after
 *  a reinstall, where SecureStore kept the device key but the queue (and the counter) started empty —
 *  without this the phone re-issues seq 1.. against ids the server has under different timestamps. */
export async function ensureSeqAbove(tx: Tx, serverHighWater: number): Promise<void> {
  const stored = await getMeta(tx, SEQ_KEY);
  const local = stored ? Number(stored) : 0;
  if (serverHighWater > local) await setMeta(tx, SEQ_KEY, String(serverHighWater));
}

export async function enqueueFix(tx: Tx, fix: Omit<LocationFix, 'seq'>): Promise<number> {
  const seq = await reserveSeq(tx);
  await tx.run(
    `INSERT INTO location_fix_queue
       (seq, ts, lat, lon, accuracy_m, altitude_m, heading_deg, speed_mps, activity, provider, battery_pct, is_moving, is_mock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [seq, fix.ts, fix.lat, fix.lon, fix.accuracyM, fix.altitudeM, fix.headingDeg, fix.speedMps,
      fix.activity, fix.provider, fix.batteryPct, fix.isMoving ? 1 : 0, fix.isMock ? 1 : 0],
  );
  return seq;
}

/** Oldest first — the server's rollup reads a chronological track, and a partial upload should leave
 *  a contiguous prefix rather than holes. Rows deferred by a clock-skew reject stay out until due. */
export async function pendingFixes(tx: Tx, nowIso: string, limit: number): Promise<LocationFix[]> {
  const rows = await tx.all<FixRow>(
    'SELECT * FROM location_fix_queue WHERE next_attempt_at IS NULL OR next_attempt_at <= ? ORDER BY seq LIMIT ?',
    [nowIso, limit],
  );
  return rows.map(toFix);
}

/** Holds one row back until a fast device clock catches up with its timestamp. */
export async function deferFix(tx: Tx, seq: number, untilIso: string): Promise<void> {
  await tx.run('UPDATE location_fix_queue SET next_attempt_at = ? WHERE seq = ?', [untilIso, seq]);
}

/** Rows the server can never accept again (older than its retention window) — dropped before they
 *  can accumulate into a queue full of doomed uploads. */
export async function pruneExpired(tx: Tx, cutoffIso: string): Promise<number> {
  const before = await queueDepth(tx);
  await tx.run('DELETE FROM location_fix_queue WHERE ts < ?', [cutoffIso]);
  return before - (await queueDepth(tx));
}

/** Hard ceiling, oldest-first. Weeks offline at driving cadence is ~13 MB/month; the queue must have
 *  a bound rather than growing until the device runs out of space. */
export async function trimToCap(tx: Tx, cap: number): Promise<number> {
  const depth = await queueDepth(tx);
  if (depth <= cap) return 0;
  const excess = depth - cap;
  await tx.run('DELETE FROM location_fix_queue WHERE seq IN (SELECT seq FROM location_fix_queue ORDER BY seq LIMIT ?)', [excess]);
  return excess;
}

export async function deleteFixes(tx: Tx, seqs: number[]): Promise<void> {
  if (seqs.length === 0) return;
  const placeholders = seqs.map(() => '?').join(',');
  await tx.run(`DELETE FROM location_fix_queue WHERE seq IN (${placeholders})`, seqs);
}

/** Drops everything at or below a seq — how a server cursor prunes fixes it already holds. */
export async function deleteFixesUpTo(tx: Tx, seq: number): Promise<void> {
  await tx.run('DELETE FROM location_fix_queue WHERE seq <= ?', [seq]);
}

export async function queueDepth(tx: Tx): Promise<number> {
  const row = await tx.first<{ n: number }>('SELECT COUNT(*) AS n FROM location_fix_queue');
  return row?.n ?? 0;
}

export async function oldestQueuedTs(tx: Tx): Promise<string | null> {
  const row = await tx.first<{ ts: string }>('SELECT ts FROM location_fix_queue ORDER BY seq LIMIT 1');
  return row?.ts ?? null;
}

export async function clearQueue(tx: Tx): Promise<void> {
  await tx.run('DELETE FROM location_fix_queue');
}
