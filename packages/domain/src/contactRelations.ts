// Contact↔contact relation taxonomy + ego-graph builder. Pure: the UI maps generated DTOs onto
// the structural RelationEntry shape and feeds one entry list per fetched contact.
import { CATEGORY_ORDER, sectorRadialLayout } from './relationLayout';

// All kinds are storable (== generated ContactRelationKind). The extended-family kinds are also produced by the
// API's read-time inference over the parent/child graph — explicit vs inferred is carried by RelationProvenance,
// not by the kind.
export type RelationKind =
  | 'Parent'
  | 'Child'
  | 'Sibling'
  | 'Spouse'
  | 'Partner'
  | 'Friend'
  | 'Colleague'
  | 'Neighbor'
  | 'Other'
  | 'Grandparent'
  | 'Grandchild'
  | 'AuntUncle'
  | 'NieceNephew'
  | 'Cousin';

/** Alias kept for the resolved-entry shape; identical to RelationKind now that extended kin are storable. */
export type KinKind = RelationKind;

export type RelationProvenance = 'Explicit' | 'Inferred';

export type RelationCategory = 'Family' | 'Social' | 'Professional' | 'Other';

/** The kinds a user can store/edit (the add-form select), immediate/social first, extended kin last. */
export const RELATION_KINDS: RelationKind[] = [
  'Parent',
  'Child',
  'Sibling',
  'Spouse',
  'Partner',
  'Friend',
  'Colleague',
  'Neighbor',
  'Other',
  'Grandparent',
  'Grandchild',
  'AuntUncle',
  'NieceNephew',
  'Cousin',
];

const CATEGORY: Record<KinKind, RelationCategory> = {
  Parent: 'Family',
  Child: 'Family',
  Sibling: 'Family',
  Spouse: 'Family',
  Partner: 'Family',
  Grandparent: 'Family',
  Grandchild: 'Family',
  AuntUncle: 'Family',
  NieceNephew: 'Family',
  Cousin: 'Family',
  Friend: 'Social',
  Neighbor: 'Social',
  Colleague: 'Professional',
  Other: 'Other',
};

// Mirrors the API's ContactRelationKinds.Inverse: Parent↔Child, Grandparent↔Grandchild,
// AuntUncle↔NieceNephew; the rest (incl. Sibling, Cousin) are symmetric.
const INVERSE: Record<RelationKind, RelationKind> = {
  Parent: 'Child',
  Child: 'Parent',
  Grandparent: 'Grandchild',
  Grandchild: 'Grandparent',
  AuntUncle: 'NieceNephew',
  NieceNephew: 'AuntUncle',
  Sibling: 'Sibling',
  Spouse: 'Spouse',
  Partner: 'Partner',
  Friend: 'Friend',
  Colleague: 'Colleague',
  Neighbor: 'Neighbor',
  Cousin: 'Cousin',
  Other: 'Other',
};

export function kindCategory(kind: KinKind): RelationCategory {
  return CATEGORY[kind];
}

export function inverseKind(kind: RelationKind): RelationKind {
  return INVERSE[kind];
}

export function isSymmetric(kind: RelationKind): boolean {
  return INVERSE[kind] === kind;
}

/** A relation copy as one contact stores it (ContactRelationDto; the mobile mirror doc's `relations`):
 *  "toContactId is my kind". Storage, not the relationship — the other side may hold a copy too. */
export interface StoredRelation {
  toContactId: string;
  kind: RelationKind;
  label?: string | null;
  since?: string | null;
  note?: string | null;
  ended?: boolean;
  until?: string | null;
}

export interface RelationCopy {
  holderId: string;
  edge: StoredRelation;
}

/** Side-independent identity of a relationship: "high is low's kind", ids ordered as strings. */
export interface RelationshipKey {
  low: string;
  high: string;
  kind: RelationKind;
}

/** The key of "otherId is selfId's kind" — the same whichever side states it. */
export function relationshipKey(selfId: string, otherId: string, kind: RelationKind): RelationshipKey {
  return selfId <= otherId ? { low: selfId, high: otherId, kind } : { low: otherId, high: selfId, kind: INVERSE[kind] };
}

/** A relationship as seen from one of its contacts: `kind` is the other's role, `label` the viewer's own word. */
export interface ResolvedRelation {
  otherId: string;
  kind: RelationKind;
  label: string | null;
  since: string | null;
  note: string | null;
  ended: boolean;
  until: string | null;
}

/**
 * Merge stored copies into relationships seen from `viewerId`, the way LupiraContactApi's
 * RelationResolver does, so an offline read agrees with `GET /contacts/{id}/relations`: the label
 * comes from the viewer's own copy; since/note/until from the low contact's copy, falling back to
 * the other; ended only when every copy is.
 */
export function resolveRelations(viewerId: string, copies: Iterable<RelationCopy>): ResolvedRelation[] {
  const groups = new Map<string, { key: RelationshipKey; copies: RelationCopy[] }>();
  for (const c of copies) {
    if ((c.holderId === viewerId) === (c.edge.toContactId === viewerId)) continue; // someone else's, or a self-loop
    const key = relationshipKey(c.holderId, c.edge.toContactId, c.edge.kind);
    const id = `${key.low}|${key.high}|${key.kind}`;
    const group = groups.get(id);
    if (group) group.copies.push(c);
    else groups.set(id, { key, copies: [c] });
  }
  return [...groups.values()].map(({ key, copies: held }) => {
    const edges = [...held].sort((a, b) => Number(a.holderId !== key.low) - Number(b.holderId !== key.low)).map((c) => c.edge);
    const first = (field: 'since' | 'note' | 'until') => edges.find((e) => e[field] != null)?.[field] ?? null;
    const ended = edges.every((e) => e.ended === true);
    const viewerIsLow = key.low === viewerId;
    return {
      otherId: viewerIsLow ? key.high : key.low,
      kind: viewerIsLow ? key.kind : INVERSE[key.kind],
      label: held.find((c) => c.holderId === viewerId)?.edge.label ?? null,
      since: first('since'),
      note: first('note'),
      ended,
      until: ended ? first('until') : null,
    };
  });
}

/** One relationship as seen from a viewing contact (structurally == ContactRelationEntryDto): `kind` is the
 *  other contact's role relative to the viewer, `label` the viewer's own name for them. */
export interface RelationEntry {
  contactId: string;
  displayName: string;
  kind: KinKind;
  label?: string | null;
  provenance?: RelationProvenance;
  /** Ended relationships (ex-spouse, falling-out) no longer assert current kinship — excluded from the graph. */
  ended?: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  /** How this node relates into the tree ('self' = the centered contact). */
  category: RelationCategory | 'self';
  depth: number;
  isCenter: boolean;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  /** Elder side of a directed kinship, lower id of a symmetric one; for inferred edges, the center contact. */
  source: string;
  target: string;
  kind: KinKind;
  label?: string | null;
  category: RelationCategory;
  /** Asymmetric kinds (Parent/Child) get an arrowhead. */
  directed: boolean;
  /** Derived from the kinship graph rather than a stored edge (rendered dashed, read-only). */
  inferred?: boolean;
}

export interface RelationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RelationGraphOptions {
  /** Keep only these categories' edges (empty/undefined = all); nodes left unreachable drop out. */
  categories?: ReadonlySet<RelationCategory>;
}

// Directed kinship pairs collapse to one elder-rooted edge (arrow elder→younger) so a stored edge and its
// derived inverse dedupe: the "younger" kind maps to its "elder" partner. Symmetric kinds fall through.
const ELDER_KIND: Partial<Record<RelationKind, RelationKind>> = { Parent: 'Parent', Grandparent: 'Grandparent', AuntUncle: 'AuntUncle' };
const YOUNGER_TO_ELDER: Partial<Record<RelationKind, RelationKind>> = { Child: 'Parent', Grandchild: 'Grandparent', NieceNephew: 'AuntUncle' };

/**
 * Normalize "other is viewer's kind" to a single display orientation, so a relationship seen from
 * either of its contacts dedupes to one edge: directed kinships → arrow elder → younger; symmetric
 * kinds → endpoints sorted.
 */
function orient(viewer: string, other: string, kind: RelationKind): { source: string; target: string; kind: RelationKind } {
  const elder = ELDER_KIND[kind];
  if (elder) return { source: other, target: viewer, kind: elder }; // other is viewer's elder (parent/grandparent/aunt-uncle)
  const asElder = YOUNGER_TO_ELDER[kind];
  if (asElder) return { source: viewer, target: other, kind: asElder }; // viewer is the elder
  return viewer < other ? { source: viewer, target: other, kind } : { source: other, target: viewer, kind };
}

/**
 * Merge per-contact relation lists into one deduped directed ego-graph, radially laid out around
 * `center`. Each entry is oriented independently of its viewer, so the two sides of a relationship
 * collapse to a single edge — and an unexpanded neighbor still contributes its edge via the center's
 * own list. The edge label is the first viewer's (the center's, when it lists the edge).
 */
export function buildRelationGraph(
  center: { id: string; label: string },
  entriesByContact: ReadonlyMap<string, readonly RelationEntry[]>,
  opts?: RelationGraphOptions,
): RelationGraph {
  const names = new Map<string, string>([[center.id, center.label]]);
  const edges = new Map<string, GraphEdge>();

  for (const [viewer, entries] of entriesByContact) {
    for (const e of entries) {
      names.set(e.contactId, e.displayName);

      // Inferred kin (only ever supplied for the center): a dashed spoke, not a stored edge.
      if (e.provenance === 'Inferred') {
        const key = `kin|${viewer}|${e.contactId}|${e.kind}`;
        if (!edges.has(key))
          edges.set(key, {
            id: key,
            source: viewer,
            target: e.contactId,
            kind: e.kind,
            label: null,
            category: kindCategory(e.kind),
            directed: false,
            inferred: true,
          });
        continue;
      }

      if (e.ended) continue; // ended relationships stay listed on the card but leave the graph

      const o = orient(viewer, e.contactId, e.kind);
      const key = `${o.source}|${o.target}|${o.kind}`;
      const existing = edges.get(key);
      if (!existing) {
        edges.set(key, {
          id: key,
          source: o.source,
          target: o.target,
          kind: o.kind,
          label: e.label ?? null,
          category: kindCategory(o.kind),
          directed: !isSymmetric(o.kind),
        });
      } else if (e.label && !existing.label) {
        existing.label = e.label;
      }
    }
  }

  const active = opts?.categories;
  const allEdges = [...edges.values()].filter((e) => !active?.size || active.has(e.category));
  const { depth, category, children } = walkFromCenter(center.id, allEdges);
  const pos = sectorRadialLayout(center.id, children, depth, category, names);

  // Only what's reachable from the center is drawn (matters once category filtering cuts edges).
  const edgeList = allEdges.filter((e) => depth.has(e.source) && depth.has(e.target));
  const nodes: GraphNode[] = [...depth.keys()].map((id) => {
    const p = pos.get(id)!;
    return {
      id,
      label: names.get(id) ?? id.slice(0, 8),
      category: id === center.id ? 'self' : category.get(id) ?? 'Other',
      depth: depth.get(id)!,
      isCenter: id === center.id,
      x: p.x,
      y: p.y,
    };
  });

  return { nodes, edges: edgeList };
}

export interface RelationEntryGroup<T> {
  category: RelationCategory;
  total: number;
  explicit: T[];
  inferred: T[];
}

/** Bucket relation entries per category (in CATEGORY_ORDER, empty ones omitted) and per
 *  provenance within it, alphabetically — the shape the grouped list renders. */
export function groupRelationEntries<T extends Pick<RelationEntry, 'kind' | 'provenance' | 'displayName'>>(
  entries: readonly T[],
): RelationEntryGroup<T>[] {
  const byName = (a: T, b: T) => a.displayName.localeCompare(b.displayName);
  const groups = new Map<RelationCategory, RelationEntryGroup<T>>();
  for (const e of entries) {
    const cat = kindCategory(e.kind);
    let g = groups.get(cat);
    if (!g) groups.set(cat, (g = { category: cat, total: 0, explicit: [], inferred: [] }));
    (e.provenance === 'Inferred' ? g.inferred : g.explicit).push(e);
    g.total++;
  }
  for (const g of groups.values()) {
    g.explicit.sort(byName);
    g.inferred.sort(byName);
  }
  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => groups.get(c)!);
}

interface Walk {
  depth: Map<string, number>;
  category: Map<string, RelationCategory>;
  children: Map<string, string[]>;
}

/** BFS the undirected edge graph from the center; record depth, the BFS child tree, and the
 *  category of the edge each node was first reached through (used for node color). */
function walkFromCenter(centerId: string, edges: GraphEdge[]): Walk {
  const adj = new Map<string, { to: string; category: RelationCategory }[]>();
  const link = (a: string, b: string, cat: RelationCategory) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, category: cat });
  };
  for (const e of edges) {
    link(e.source, e.target, e.category);
    link(e.target, e.source, e.category);
  }

  const depth = new Map<string, number>([[centerId, 0]]);
  const category = new Map<string, RelationCategory>();
  const children = new Map<string, string[]>();
  const queue = [centerId];
  while (queue.length) {
    const cur = queue.shift()!;
    const neighbors = (adj.get(cur) ?? []).slice().sort((a, b) => a.to.localeCompare(b.to));
    for (const n of neighbors) {
      if (depth.has(n.to)) continue;
      depth.set(n.to, depth.get(cur)! + 1);
      category.set(n.to, n.category);
      if (!children.has(cur)) children.set(cur, []);
      children.get(cur)!.push(n.to);
      queue.push(n.to);
    }
  }
  return { depth, category, children };
}

