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
