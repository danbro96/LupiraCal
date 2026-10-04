/** The one error the clients' data layers throw. Status 0 = transport failure/timeout (no HTTP response). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The human line of an error response: a problem+json document's `detail` or `title` (the APIs answer
 *  400/403/409 that way), else the raw body, else `fallback`. */
export function problemMessage(body: string, fallback: string): string {
  try {
    const problem = JSON.parse(body) as { detail?: unknown; title?: unknown };
    if (typeof problem.detail === 'string' && problem.detail) return problem.detail;
    if (typeof problem.title === 'string' && problem.title) return problem.title;
  } catch {
    // not a problem document
  }
  return body || fallback;
}

/** What to show a person for a caught error — its message, without the "Error:" prefix String() adds. */
/** Shown when a request never reached the server. */
export const NETWORK_ERROR = 'Network error — check your connection and try again.';

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
