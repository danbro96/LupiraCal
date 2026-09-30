// Interaction-ranked ordering for contact pickers: highest recency-weighted score first (the server decays
// each shared occurrence, so people you stopped meeting fade), then most shared items, then most recent
// shared occurrence, ties keeping the caller's base order (alphabetical from the API).

export interface InteractionLike {
  contactId?: string;
  count?: number;
  lastAt?: string | null;
  score?: number;
}

export function rankByInteraction<T extends { id?: string }>(
  contacts: readonly T[],
  summary: readonly InteractionLike[] | undefined,
): T[] {
  if (!summary?.length) return [...contacts];
  const byContact = new Map(summary.map((e) => [e.contactId ?? '', e]));
  const score = (c: T) => byContact.get(c.id ?? '')?.score ?? 0;
  const count = (c: T) => byContact.get(c.id ?? '')?.count ?? 0;
  const lastAt = (c: T) => {
    const at = byContact.get(c.id ?? '')?.lastAt;
    return (at && Date.parse(at)) || 0;
  };
  return [...contacts].sort((a, b) => score(b) - score(a) || count(b) - count(a) || lastAt(b) - lastAt(a));
}
