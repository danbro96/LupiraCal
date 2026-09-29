import { setApiTransport } from '@lupira/cal-api/transport';
import { ApiError, problemMessage } from '@lupira/cal-domain/apiError';

/**
 * The SPA's transport for every generated request. Auth rides the BFF's HttpOnly cookie session
 * (same-origin), so we send credentials and never a bearer. A 401 means the session expired →
 * bounce to the BFF sign-in, returning here afterwards.
 *
 * There is one of these now rather than one per upstream: the merged spec carries each BFF route
 * prefix in the path, so nothing is left for a mutator to prepend.
 */
export { ApiError };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include', ...init });
  } catch {
    throw new ApiError(0, 'Network error — check your connection and try again.');
  }
  if (res.status === 401) {
    const returnUrl = window.location.pathname + window.location.search;
    window.location.assign(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    throw new ApiError(401, 'Not authenticated');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, problemMessage(text, res.statusText || `HTTP ${res.status}`));
  }
  if (res.status === 204) return undefined as T;
  // A 200 of HTML means the SPA fallback answered a dead route; parsing it fails obscurely.
  if ((res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new ApiError(res.status, `Expected data from ${url} but received the app shell.`);
  }

  return (await res.json()) as T;
}

/** Installed once from main.tsx, before anything can issue a request. */
export function installApiTransport(): void {
  setApiTransport(request);
}
