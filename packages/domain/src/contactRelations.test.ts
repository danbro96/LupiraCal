import { describe, expect, it } from 'vitest';
import {
  buildRelationGraph,
  groupRelationEntries,
  inverseKind,
  isSymmetric,
  kindCategory,
  relationshipKey,
  resolveRelations,
} from './contactRelations';
import type { RelationCopy, RelationEntry, StoredRelation } from './contactRelations';
import { DEFAULT_LAYOUT } from './relationLayout';

describe('kind taxonomy', () => {
  it('maps kinds to categories', () => {
    expect(kindCategory('Parent')).toBe('Family');
    expect(kindCategory('Friend')).toBe('Social');
    expect(kindCategory('Neighbor')).toBe('Social');
    expect(kindCategory('Colleague')).toBe('Professional');
    expect(kindCategory('Other')).toBe('Other');
  });

  it('categorizes extended-family kinds as Family', () => {
    for (const k of ['Grandparent', 'Grandchild', 'AuntUncle', 'NieceNephew', 'Cousin'] as const)
      expect(kindCategory(k)).toBe('Family');
  });

  it('inverts the directed kinship pairs, else self', () => {
    expect(inverseKind('Parent')).toBe('Child');
    expect(inverseKind('Child')).toBe('Parent');
    expect(inverseKind('Grandparent')).toBe('Grandchild');
    expect(inverseKind('Grandchild')).toBe('Grandparent');
    expect(inverseKind('AuntUncle')).toBe('NieceNephew');
    expect(inverseKind('NieceNephew')).toBe('AuntUncle');
    expect(inverseKind('Sibling')).toBe('Sibling');
    expect(inverseKind('Cousin')).toBe('Cousin');
    expect(inverseKind('Friend')).toBe('Friend');
  });

  it('flags symmetric kinds', () => {
    expect(isSymmetric('Sibling')).toBe(true);
    expect(isSymmetric('Spouse')).toBe(true);
    expect(isSymmetric('Cousin')).toBe(true);
    expect(isSymmetric('Parent')).toBe(false);
    expect(isSymmetric('Grandparent')).toBe(false);
    expect(isSymmetric('AuntUncle')).toBe(false);
  });
});

const center = { id: 'Y', label: 'Yara' };

describe('buildRelationGraph', () => {
  it('collapses both sides of a relationship into one parent→child edge', () => {
    // Y sees X as its Parent ("dad"); X sees Y as its Child.
    const entries = new Map<string, RelationEntry[]>([
      ['Y', [{ contactId: 'X', displayName: 'Xavier', kind: 'Parent', label: 'dad' }]],
      ['X', [{ contactId: 'Y', displayName: 'Yara', kind: 'Child' }]],
    ]);
    const g = buildRelationGraph(center, entries);
    expect(g.edges).toHaveLength(1);
    // Normalized parent → child: X (parent) → Y (child).
    expect(g.edges[0]).toMatchObject({ source: 'X', target: 'Y', kind: 'Parent', label: 'dad', directed: true });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['X', 'Y']);
  });

  it('collapses Grandparent and Grandchild views into one elder→younger edge', () => {
    const entries = new Map<string, RelationEntry[]>([
      ['Y', [{ contactId: 'X', displayName: 'Xavier', kind: 'Grandparent' }]],
      ['X', [{ contactId: 'Y', displayName: 'Yara', kind: 'Grandchild' }]],
    ]);
    const g = buildRelationGraph(center, entries);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ source: 'X', target: 'Y', kind: 'Grandparent', directed: true });
  });

  it('derives the edge for an unexpanded neighbor from the center list alone', () => {
    // Only Y fetched: Z is Y's parent, which still yields Z's node + edge.
    const entries = new Map<string, RelationEntry[]>([
      ['Y', [{ contactId: 'Z', displayName: 'Zoe', kind: 'Parent' }]],
    ]);
    const g = buildRelationGraph(center, entries);
    expect(g.edges).toHaveLength(1);
    // Z is Y's parent → arrow Z (parent) → Y (child).
    expect(g.edges[0]).toMatchObject({ source: 'Z', target: 'Y', kind: 'Parent' });
    expect(g.nodes.find((n) => n.id === 'Z')?.label).toBe('Zoe');
  });

  it('renders inferred kin as dashed, undirected spokes from the center', () => {
    const entries = new Map<string, RelationEntry[]>([
      [
        'Y',
        [
          { contactId: 'P', displayName: 'Pat', kind: 'Parent' },
          { contactId: 'G', displayName: 'Gramps', kind: 'Grandparent', provenance: 'Inferred' },
        ],
      ],
    ]);
    const g = buildRelationGraph(center, entries);
    const kin = g.edges.find((e) => e.target === 'G')!;
    expect(kin).toMatchObject({ source: 'Y', kind: 'Grandparent', inferred: true, directed: false, category: 'Family' });
    expect(g.edges.find((e) => e.kind === 'Parent')?.inferred).toBeUndefined(); // stored edge unaffected
    expect(g.nodes.find((n) => n.id === 'G')?.label).toBe('Gramps');
  });

  it('orients both children of a parent identically', () => {
    const p = { id: 'P', label: 'Parent' };
    const entries = new Map<string, RelationEntry[]>([
      [
        'P',
        [
          { contactId: 'A', displayName: 'A', kind: 'Child' },
          { contactId: 'B', displayName: 'B', kind: 'Child' },
        ],
      ],
    ]);
    const g = buildRelationGraph(p, entries);
    expect(g.edges).toHaveLength(2);
    for (const e of g.edges) {
      expect(e.source).toBe('P');
      expect(e.kind).toBe('Parent');
      expect(e.directed).toBe(true);
    }
    expect(g.edges.map((e) => e.target).sort()).toEqual(['A', 'B']);
  });

  it('marks symmetric relations undirected and categorizes nodes by the reaching edge', () => {
    const entries = new Map<string, RelationEntry[]>([
      [
        'Y',
        [
          { contactId: 'S', displayName: 'Sam', kind: 'Sibling' },
          { contactId: 'C', displayName: 'Cleo', kind: 'Colleague' },
        ],
      ],
    ]);
    const g = buildRelationGraph(center, entries);
    expect(g.edges.find((e) => e.source === 'S' || e.target === 'S')?.directed).toBe(false);
    expect(g.nodes.find((n) => n.id === 'S')?.category).toBe('Family');
    expect(g.nodes.find((n) => n.id === 'C')?.category).toBe('Professional');
    expect(g.nodes.find((n) => n.isCenter)?.category).toBe('self');
  });

  it('excludes ended relationships from the graph', () => {
    const entries = new Map<string, RelationEntry[]>([
      [
        'Y',
        [
          { contactId: 'E', displayName: 'Ex', kind: 'Spouse', ended: true },
          { contactId: 'F', displayName: 'Fern', kind: 'Friend' },
        ],
      ],
    ]);
    const g = buildRelationGraph(center, entries);
    expect(g.edges).toHaveLength(1);
    expect([g.edges[0].source, g.edges[0].target]).toContain('F'); // the surviving edge is the (non-ended) Friend to F
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['F', 'Y']);
  });

  it('places the center at the origin and neighbors beyond the first ring, deterministically', () => {
    const entries = new Map<string, RelationEntry[]>([
      [
        'Y',
        [
          { contactId: 'A', displayName: 'A', kind: 'Friend' },
          { contactId: 'B', displayName: 'B', kind: 'Friend' },
        ],
      ],
    ]);
    const g1 = buildRelationGraph(center, entries);
    const g2 = buildRelationGraph(center, entries);
    const c = g1.nodes.find((n) => n.isCenter)!;
    expect([c.x, c.y]).toEqual([0, 0]);
    const radius = (n: { x: number; y: number }) => Math.hypot(n.x, n.y);
    for (const n of g1.nodes.filter((n) => n.depth === 1))
      expect(radius(n)).toBeGreaterThanOrEqual(DEFAULT_LAYOUT.baseRadius);
    expect(g1.nodes.map((n) => [n.id, n.x, n.y])).toEqual(g2.nodes.map((n) => [n.id, n.x, n.y]));
  });

  it("labels an edge with the center's own word for the other", () => {
    const entries = new Map<string, RelationEntry[]>([
      ['Y', [{ contactId: 'X', displayName: 'Xavier', kind: 'Parent', label: 'dad' }]],
      ['X', [{ contactId: 'Y', displayName: 'Yara', kind: 'Child', label: 'kiddo' }]],
    ]);
    expect(buildRelationGraph(center, entries).edges[0].label).toBe('dad');
  });

  it('drops filtered-out categories and anything only reachable through them', () => {
    // S (Social) bridges to C (Professional, from S's own list); F is Family.
    const entries = new Map<string, RelationEntry[]>([
      [
        'Y',
        [
          { contactId: 'F', displayName: 'Fam', kind: 'Parent' },
          { contactId: 'S', displayName: 'Soc', kind: 'Friend' },
        ],
      ],
      ['S', [{ contactId: 'C', displayName: 'Col', kind: 'Colleague' }]],
    ]);
    const g = buildRelationGraph(center, entries, { categories: new Set(['Family']) });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['F', 'Y']);
    expect(g.edges).toHaveLength(1);
    // An empty set means no filter.
    const all = buildRelationGraph(center, entries, { categories: new Set() });
    expect(all.nodes.map((n) => n.id).sort()).toEqual(['C', 'F', 'S', 'Y']);
  });
});

describe('groupRelationEntries', () => {
  it('buckets by category in fixed order, splitting provenance, alphabetically', () => {
    const entries: RelationEntry[] = [
      { contactId: '1', displayName: 'Zoe', kind: 'Friend' },
      { contactId: '2', displayName: 'Anna', kind: 'Friend' },
      { contactId: '3', displayName: 'Boss', kind: 'Colleague' },
      { contactId: '4', displayName: 'Mum', kind: 'Parent' },
      { contactId: '5', displayName: 'Gran', kind: 'Grandparent', provenance: 'Inferred' },
    ];
    const groups = groupRelationEntries(entries);
    expect(groups.map((g) => g.category)).toEqual(['Family', 'Social', 'Professional']); // Other omitted
    const family = groups[0];
    expect(family.total).toBe(2);
    expect(family.explicit.map((e) => e.displayName)).toEqual(['Mum']);
    expect(family.inferred.map((e) => e.displayName)).toEqual(['Gran']);
    const social = groups[1];
    expect(social.explicit.map((e) => e.displayName)).toEqual(['Anna', 'Zoe']);
    expect(groups[2].explicit.map((e) => e.displayName)).toEqual(['Boss']);
  });

  it('returns nothing for no entries', () => {
    expect(groupRelationEntries([])).toEqual([]);
  });
});

const LOW = '11111111-1111-1111-1111-111111111111';
const HIGH = '99999999-9999-9999-9999-999999999999';
const copy = (holderId: string, edge: StoredRelation): RelationCopy => ({ holderId, edge });

// Same cases as LupiraContactApi's RelationResolverTests: the two resolvers must agree.
describe('resolveRelations', () => {
  it('reads a copy the same from both sides whichever holds it', () => {
    for (const held of [
      copy(LOW, { toContactId: HIGH, kind: 'Parent', since: '1990-01-01' }),
      copy(HIGH, { toContactId: LOW, kind: 'Child', since: '1990-01-01' }),
    ]) {
      expect(resolveRelations(LOW, [held])).toEqual([
        { otherId: HIGH, kind: 'Parent', label: null, since: '1990-01-01', note: null, ended: false, until: null },
      ]);
      expect(resolveRelations(HIGH, [held])).toEqual([
        { otherId: LOW, kind: 'Child', label: null, since: '1990-01-01', note: null, ended: false, until: null },
      ]);
    }
  });

  it('merges both copies into one relationship with a label per side', () => {
    const copies = [
      copy(LOW, { toContactId: HIGH, kind: 'Parent', label: 'dad' }),
      copy(HIGH, { toContactId: LOW, kind: 'Child', label: 'son' }),
    ];
    expect(resolveRelations(LOW, copies).map((r) => r.label)).toEqual(['dad']);
    expect(resolveRelations(HIGH, copies).map((r) => r.label)).toEqual(['son']);
  });

  it('agrees on shared fields across viewers even when legacy copies disagree', () => {
    const copies = [
      copy(HIGH, { toContactId: LOW, kind: 'Friend', since: '2001-01-01', note: 'school' }),
      copy(LOW, { toContactId: HIGH, kind: 'Friend', since: '2002-02-02' }),
    ];
    const [fromLow] = resolveRelations(LOW, copies);
    const [fromHigh] = resolveRelations(HIGH, copies);
    expect([fromLow.since, fromLow.note]).toEqual(['2002-02-02', 'school']); // low's copy first, the other fills gaps
    expect([fromHigh.since, fromHigh.note]).toEqual([fromLow.since, fromLow.note]);
  });

  it('is ended only when every copy is', () => {
    const oneLive = [
      copy(LOW, { toContactId: HIGH, kind: 'Spouse', ended: true, until: '2020-05-01' }),
      copy(HIGH, { toContactId: LOW, kind: 'Spouse' }),
    ];
    const bothEnded = [
      copy(LOW, { toContactId: HIGH, kind: 'Spouse', ended: true, until: '2020-05-01' }),
      copy(HIGH, { toContactId: LOW, kind: 'Spouse', ended: true }),
    ];
    expect(resolveRelations(LOW, oneLive)[0]).toMatchObject({ ended: false, until: null });
    expect(resolveRelations(HIGH, bothEnded)[0]).toMatchObject({ ended: true, until: '2020-05-01' });
  });

  it('keeps distinct kinds between the same pair distinct', () => {
    const copies = [copy(LOW, { toContactId: HIGH, kind: 'Friend' }), copy(HIGH, { toContactId: LOW, kind: 'Colleague' })];
    expect(resolveRelations(LOW, copies).map((r) => r.kind).sort()).toEqual(['Colleague', 'Friend']);
  });

  it('ignores copies that do not touch the viewer', () => {
    const copies = [copy(HIGH, { toContactId: 'bystander', kind: 'Friend' }), copy(LOW, { toContactId: LOW, kind: 'Friend' })];
    expect(resolveRelations(LOW, copies)).toEqual([]);
  });

  it('keys a relationship the same from either side, ordering ids as strings', () => {
    expect(relationshipKey(LOW, HIGH, 'Parent')).toEqual(relationshipKey(HIGH, LOW, 'Child'));
    expect(relationshipKey(HIGH, LOW, 'Child')).toEqual({ low: LOW, high: HIGH, kind: 'Parent' });
    expect(relationshipKey('80000000-0000-0000-0000-000000000000', '0fffffff-ffff-ffff-ffff-ffffffffffff', 'Friend').low)
      .toBe('0fffffff-ffff-ffff-ffff-ffffffffffff');
  });
});
