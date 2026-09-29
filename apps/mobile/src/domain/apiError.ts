import { ApiError } from '@lupira/cal-domain/apiError';

export { ApiError };

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0;
}

export const REQUEST_TIMEOUT_MS = 10_000;
