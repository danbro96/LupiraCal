import { describe, expect, it } from 'vitest';
import { isPinned, partitionByActivity, PINNED_TAG, type TierableContact, visibleTags, withPinPreserved } from './contactTiers';

const NOW = Date.parse('2026-07-14T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const c = (id: string, extra: Partial<TierableContact> = {}): TierableContact => ({
  id,
  createdAt: daysAgo(400),
  ...extra,
});

const opts = { now: NOW, graceDays: 30, relatedIds: new Set(['rel', 'a']) };

describe('partitionByActivity', () => {
  it('activates on any single signal and collapses pure edge contacts', () => {
    const interacted = c('int');
    const related = c('rel');
    const pinned = c('pin', { tags: [PINNED_TAG] });
    const recent = c('new', { createdAt: daysAgo(3) });
    const edge = c('edge');

    const { active, dormant } = partitionByActivity(
      [interacted, related, pinned, recent, edge],
      [{ contactId: 'int', count: 4, lastAt: daysAgo(2) }],
      opts,
    );

    expect(active.map((x) => x.id).sort()).toEqual(['int', 'new', 'pin', 'rel']);
    expect(dormant.map((x) => x.id)).toEqual(['edge']);
  });

  it('floats pinned to the top, then orders the rest by interaction', () => {
    const { active } = partitionByActivity(
      [
        c('a'),
        c('busy'),
        c('pinned', { tags: [PINNED_TAG] }),
      ],
      [
        { contactId: 'busy', count: 9, lastAt: daysAgo(1) },
        { contactId: 'pinned', count: 1, lastAt: daysAgo(100) },
      ],
      opts,
    );
    expect(active.map((x) => x.id)).toEqual(['pinned', 'busy', 'a']);
  });

  it('with no summary, only relation/pin/recency rescue contacts', () => {
    const { active, dormant } = partitionByActivity(
      [c('rel'), c('edge'), c('recent', { createdAt: daysAgo(5) })],
      undefined,
      opts,
    );
    expect(active.map((x) => x.id).sort()).toEqual(['recent', 'rel']);
    expect(dormant.map((x) => x.id)).toEqual(['edge']);
  });

  it('a zero-count summary row is not interaction', () => {
    const { dormant } = partitionByActivity([c('z')], [{ contactId: 'z', count: 0, lastAt: null }], opts);
    expect(dormant.map((x) => x.id)).toEqual(['z']);
  });

  it('isPinned reflects the reserved tag', () => {
    expect(isPinned({ tags: [PINNED_TAG] })).toBe(true);
    expect(isPinned({ tags: ['work'] })).toBe(false);
    expect(isPinned({})).toBe(false);
  });
});

describe('visibleTags / withPinPreserved', () => {
  it('hides the pin from the editable list and carries it through an edit', () => {
    expect(visibleTags(['family', PINNED_TAG])).toEqual(['family']);
    expect(withPinPreserved(['friends'], ['family', PINNED_TAG])).toEqual(['friends', PINNED_TAG]);
    expect(withPinPreserved(['friends'], ['family'])).toEqual(['friends']);
  });
});
