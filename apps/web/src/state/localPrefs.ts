/** Per-browser conveniences — the last calendar, a map's layers, a calendar view — remembered between visits.
 *  The URL stays the source of truth; these only fill in when it says nothing. Storage can be missing or
 *  throw (private windows, blocked site data), so every access fails quietly. */

const PREFIX = 'lupira-cal.';

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    // Not remembering is the fallback.
  }
}

const HIDDEN_SUBSCRIPTIONS = 'subscriptions.hidden';

export function readHiddenSubscriptionIds(): Set<string> {
  try {
    const v: unknown = JSON.parse(readPref(HIDDEN_SUBSCRIPTIONS) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeHiddenSubscriptionIds(ids: ReadonlySet<string>): void {
  writePref(HIDDEN_SUBSCRIPTIONS, ids.size > 0 ? JSON.stringify([...ids]) : null);
}
