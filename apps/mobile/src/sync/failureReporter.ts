import { describeFailure } from '@danbro96/lupira-sync-core/replayError';
import type { SyncFailure } from '@danbro96/lupira-sync-engine/types';
import * as Sentry from '@sentry/react-native';

/** Once per session per failure text: a failure that recurs between successful syncs would otherwise drain the Sentry quota. */
export function createSyncFailureReporter(): (failure: SyncFailure) => void {
  const reported = new Set<string>();
  return ({ phase, decision, error, aggregate }) => {
    if (decision.outcome === 'pause' || decision.outcome === 'retry') return;
    const key = describeFailure(decision);
    if (reported.has(key)) return;
    reported.add(key);
    Sentry.captureException(error, {
      tags: { area: 'sync', phase, outcome: decision.outcome, ...(decision.traceId && { server_trace_id: decision.traceId }) },
      extra: { detail: decision.detail, aggregate },
      fingerprint: ['sync', phase, decision.reason],
    });
  };
}
