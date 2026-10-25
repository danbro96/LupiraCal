import type { ReplayDecision } from '@danbro96/lupira-sync-core/replayError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/react-native', () => ({ captureException }));

const { createSyncFailureReporter } = await import('./failureReporter');

const park: ReplayDecision = { outcome: 'park', stop: false, reason: 'rejected (409)', detail: 'stale guard', traceId: 'abc123' };

beforeEach(() => captureException.mockClear());

describe('createSyncFailureReporter', () => {
  it('skips paused and retried failures', () => {
    const report = createSyncFailureReporter();
    report({ phase: 'pull', decision: { outcome: 'pause', stop: true, reason: 'signed out' }, error: new Error('401') });
    report({ phase: 'push', decision: { outcome: 'retry', stop: true, reason: 'transient (503)' }, error: new Error('503') });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports a parked failure with its tags, extras and fingerprint', () => {
    const error = new Error('conflict');
    createSyncFailureReporter()({ phase: 'push', decision: park, error, aggregate: 'cal.item' });
    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { area: 'sync', phase: 'push', outcome: 'park', server_trace_id: 'abc123' },
      extra: { detail: 'stale guard', aggregate: 'cal.item' },
      fingerprint: ['sync', 'push', 'rejected (409)'],
    });
  });

  it('omits the trace tag when the server sent none', () => {
    const { traceId: _, ...untraced } = park;
    createSyncFailureReporter()({ phase: 'pull', decision: untraced, error: new Error('x') });
    expect(captureException.mock.calls[0]![1].tags).toEqual({ area: 'sync', phase: 'pull', outcome: 'park' });
  });

  it('reports each failure text once per session', () => {
    const report = createSyncFailureReporter();
    report({ phase: 'push', decision: park, error: new Error('a') });
    report({ phase: 'push', decision: park, error: new Error('b') });
    report({ phase: 'push', decision: { ...park, detail: 'other' }, error: new Error('c') });
    expect(captureException).toHaveBeenCalledTimes(2);
  });
});
