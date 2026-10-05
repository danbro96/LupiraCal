import type { SyncEngine } from '@danbro96/lupira-sync-engine/engine';
import { Aggregate } from '../domain/aggregates';
import { currentHorizon, horizonDrifted } from '../domain/materialize';
import { readMeta, writeMeta } from './meta';

const HORIZON_KEY = 'horizon';

/** Re-materializes occurrences when the rolling window has drifted a month past the stored one, so old ones age
 *  out and new months appear without any server traffic. */
export async function maintainHorizon(engine: SyncEngine): Promise<void> {
  const horizon = currentHorizon();
  const stored = await readMeta(HORIZON_KEY);
  const parsed = stored ? (JSON.parse(stored) as { start: string; end: string }) : null;
  if (parsed && !horizonDrifted({ start: new Date(parsed.start), end: new Date(parsed.end) }, horizon)) return;
  if (parsed) {
    await engine.reindex(Aggregate.item);
    await engine.reindex(Aggregate.contact);
  }
  await writeMeta(HORIZON_KEY, JSON.stringify({ start: horizon.start.toISOString(), end: horizon.end.toISOString() }));
}
