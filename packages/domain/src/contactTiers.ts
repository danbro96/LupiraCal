// Behavioral tiering for the contacts list: split into an "Active" tier (contacts you actually use)
// and a "Dormant" remainder that the UI collapses. Inclusive predicate — any single signal keeps a
// contact Active — so a weak signal never buries a real person. Pure; sorts Active via rankByInteraction.

import { rankByInteraction, type InteractionLike } from './contactRank';

/** Reserved tag marking a manually-pinned contact. Stored in the contact's tags; hidden from the tag UI. */
export const PINNED_TAG = '⭐';

/** Structural subset of ContactDto needed to tier — keeps this module free of the data layer. */
export interface TierableContact {
  id?: string;
  tags?: readonly string[] | null;
  createdAt?: string;
}

export interface TierOptions {
  /** Epoch ms treated as "now" (injectable for tests). */
  now?: number;
  /** A contact added within this many days stays Active regardless of other signals. */
  graceDays?: number;
  /** Contacts on at least one relationship (from either side). */
  relatedIds?: ReadonlySet<string>;
}

export function isPinned(c: TierableContact): boolean {
  return c.tags?.includes(PINNED_TAG) ?? false;
}

/** The tags a person sees and edits: everything but the pin sentinel. */
export function visibleTags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).filter((t) => t !== PINNED_TAG);
}

/** An edited tag list with the hidden pin carried over from the contact's `previous` tags. */
export function withPinPreserved(next: string[], previous: readonly string[] | null | undefined): string[] {
  return (previous ?? []).includes(PINNED_TAG) && !next.includes(PINNED_TAG) ? [...next, PINNED_TAG] : next;
}

/**
 * Partition contacts into { active, dormant }. Active = interacted (participation count > 0) OR has a
 * relation OR pinned OR added within graceDays. Active is ordered by interaction (rankByInteraction)
 * with pinned floated to the top; dormant keeps input (alphabetical) order.
 */
export function partitionByActivity<T extends TierableContact>(
  contacts: readonly T[],
  summary: readonly InteractionLike[] | undefined,
  opts: TierOptions = {},
): { active: T[]; dormant: T[] } {
  const now = opts.now ?? Date.now();
  const graceMs = (opts.graceDays ?? 30) * 86_400_000;
  const interacted = new Set(
    (summary ?? []).filter((e) => (e.count ?? 0) > 0).map((e) => e.contactId ?? ''),
  );

  const isActive = (c: T): boolean =>
    interacted.has(c.id ?? '') ||
    (opts.relatedIds?.has(c.id ?? '') ?? false) ||
    isPinned(c) ||
    recentlyAdded(c.createdAt, now, graceMs);

  const active: T[] = [];
  const dormant: T[] = [];
  for (const c of contacts) (isActive(c) ? active : dormant).push(c);

  const ranked = rankByInteraction(active, summary);
  return { active: [...ranked.filter(isPinned), ...ranked.filter((c) => !isPinned(c))], dormant };
}

function recentlyAdded(createdAt: string | undefined, now: number, graceMs: number): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= now - graceMs;
}
