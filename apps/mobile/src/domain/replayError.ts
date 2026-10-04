import { ApiError } from '@danbro96/lupira-http/apiError';

/** Park-don't-wedge: what the outbox drain does with a failed replay. Pure and total so the whole decision
 *  table is unit-tested (ported from LupiraTasksMobile, with its 429 misclassification fixed — throttling is
 *  transient, not a semantic conflict). */
export type ReplayDecision = {
  outcome: 'pause' | 'park' | 'retry';
  /** Stop the drain loop (park lets the queue continue past the corpse). */
  stop: boolean;
  reason: string;
};

export function classifyReplayError(e: unknown): ReplayDecision {
  if (e instanceof ApiError) {
    // The mutator already spent its one forced re-auth; a surviving 401 means the session is gone.
    if (e.status === 401) return { outcome: 'pause', stop: true, reason: 'signed out' };
    if (e.status === 0 || e.status === 429 || e.status >= 500)
      return { outcome: 'retry', stop: true, reason: `transient (${e.status})` };
    // Remaining 4xx: a semantic conflict this op can never win (404 deleted target, 400, 403, 409).
    return { outcome: 'park', stop: false, reason: `rejected (${e.status})` };
  }
  // Non-HTTP throw = a client bug; it would fail identically forever — park it for review.
  return { outcome: 'park', stop: false, reason: `client error: ${String(e)}` };
}
