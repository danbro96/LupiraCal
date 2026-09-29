/** Contact naming both apps agree on: avatar initials and the display-name format labels. */

/** First and last word's initials — "Anna Maria Svensson" → "AS"; a single name gives one letter. */
export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Keyed by the API's DisplayNameFormat values; consumers re-type against the enum as the drift tripwire. */
export const DISPLAY_NAME_FORMAT_LABELS = {
  Full: 'Full name',
  FirstLast: 'First & last',
  NickName: 'Nickname',
} as const;
