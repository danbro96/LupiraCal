/** Wording both apps use for items, so a title or a status never reads differently between them. */

export const UNTITLED = '(untitled)';

export function displayTitle(title: string | null | undefined): string {
  return title?.trim() || UNTITLED;
}

/** The chip an item's status earns: nothing for the ordinary Confirmed (or unset), otherwise the status. */
export function statusBadge(status: string | null | undefined): string | null {
  return status && status !== 'Confirmed' ? status.toLowerCase() : null;
}
