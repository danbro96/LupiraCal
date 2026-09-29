import { problemMessage } from '@lupira/cal-domain/apiError';
import { ApiError, REQUEST_TIMEOUT_MS } from '../../domain/apiError';
import { isRetriableRequest, isTransientStatus, MAX_RETRIES, retryDelayMs } from '../../domain/retryPolicy';
import { authPort } from './authProvider';

/** What every generated fetcher returns: the status-discriminated envelope (orval's per-status unions
 *  structurally match it, so `if (r.status === 200)` narrows `r.data`). */
export type ApiEnvelope<T> = { status: number; data: T; headers: Headers };

/** Orval custom mutator. Reads the backend + token through the AuthPort at call time, injects the bearer
 *  (none in authMode 'dev'), bounds every attempt with a timeout, retries transient failures per
 *  retryPolicy, and on a terminal 401 for a retriable request forces ONE coalesced refresh — if that actually
 *  rotated the token, the retry budget resets and the call replays with the fresh bearer. */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const auth = authPort();
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');

  const entryToken = auth.getToken();
  let token = entryToken;
  let triedReauth = false;

  for (let attempt = 0; ; attempt++) {
    if (token) headers.set('Authorization', `Bearer ${token}`);
    else headers.delete('Authorization');

    const fullUrl = auth.getApiUrl().replace(/\/$/, '') + url;
    let resp: Response;
    try {
      resp = await fetchWithTimeout(fullUrl, { ...init, headers });
    } catch {
      if (attempt < MAX_RETRIES && isRetriableRequest(method, headers.has('Idempotency-Key'))) {
        await delay(retryDelayMs(attempt));
        continue;
      }
      throw new ApiError(0, 'Network error — the server could not be reached.');
    }

    if (resp.ok) {
      const data = resp.status === 204 ? undefined : await resp.json().catch(() => undefined);
      return { status: resp.status, data, headers: resp.headers } as T;
    }

    const retriable = isRetriableRequest(method, headers.has('Idempotency-Key'));
    if (isTransientStatus(resp.status) && retriable && attempt < MAX_RETRIES) {
      await delay(retryDelayMs(attempt, resp.headers.get('Retry-After')));
      continue;
    }

    // One forced re-auth per call: the store decides transient-vs-definitive; a genuinely fresh token
    // (≠ what we sent) earns a full new retry budget.
    if (resp.status === 401 && retriable && !triedReauth && entryToken) {
      triedReauth = true;
      const fresh = await auth.refresh(true, token ?? undefined);
      if (fresh && fresh !== token) {
        token = fresh;
        attempt = -1;
        continue;
      }
    }

    const body = await resp.text().catch(() => '');
    throw new ApiError(resp.status, problemMessage(body, resp.statusText || `HTTP ${resp.status}`));
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
