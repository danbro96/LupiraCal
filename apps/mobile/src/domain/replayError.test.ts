import { describe, expect, it } from 'vitest';
import { ApiError } from '@danbro96/lupira-http/apiError';
import { classifyReplayError } from './replayError';

describe('classifyReplayError', () => {
  it('pauses the drain on 401 (session gone — the mutator already spent its re-auth)', () => {
    expect(classifyReplayError(new ApiError(401, ''))).toMatchObject({ outcome: 'pause', stop: true });
  });

  it('retries transient failures including 429 (the tasks app parked throttling)', () => {
    for (const status of [0, 429, 500, 503])
      expect(classifyReplayError(new ApiError(status, ''))).toMatchObject({ outcome: 'retry', stop: true });
  });

  it('parks semantic conflicts and lets the queue continue', () => {
    for (const status of [400, 403, 404, 409])
      expect(classifyReplayError(new ApiError(status, ''))).toMatchObject({ outcome: 'park', stop: false });
  });

  it('parks client bugs (they fail identically forever)', () => {
    expect(classifyReplayError(new TypeError('boom'))).toMatchObject({ outcome: 'park', stop: false });
  });
});
