import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyItemGuards, type ItemDoc } from '../domain/docTypes';
import type { MirrorItem } from '../domain/mirrorReducers';
import type { ClientOp } from '../domain/ops';

const fx = vi.hoisted(() => ({ enqueue: vi.fn(), doc: vi.fn() }));
vi.mock('../sync/engine', () => ({ engine: { enqueue: fx.enqueue, doc: fx.doc }, readyDb: async () => ({}) }));
vi.mock('../sync/holdKeys', () => ({ withHoldKeys: async (_db: unknown, ops: ClientOp[]) => ops }));
vi.mock('../data/queries/itemLineage', () => ({ lineageRoot: async (_db: unknown, id: string) => id }));
vi.mock('../data/ids', () => ({ deterministicIdFor: async (key: string) => `id-${key}` }));

const { addToGroup, changeOccurrence, deleteFollowing, removeFromGroup, splitItem } = await import('./actions');

const weekly: MirrorItem = {
  doc: {
    id: 'item-1', title: 'Training', isAllDay: false, startsAt: '2026-08-03T17:00:00Z', endsAt: '2026-08-03T18:00:00Z',
    recurrenceRule: 'FREQ=WEEKLY;COUNT=4', extraOccurrences: ['2026-08-05T17:00:00Z'], calendars: [{ calendarId: 'cal-1', status: 'Accepted' }],
  } as ItemDoc,
  guards: emptyItemGuards(),
};
const core = { title: 'New', isAllDay: false };
const enqueued = () => fx.enqueue.mock.calls.flatMap(([ops]) => ops as ClientOp[]).map((o) => o.kind);

beforeEach(() => {
  fx.enqueue.mockReset();
  fx.doc.mockReset();
  fx.doc.mockResolvedValue(weekly);
});

describe('splitItem', () => {
  it('revises the whole series from the first occurrence', async () => {
    expect(await splitItem('item-1', '2026-08-03T17:00:00Z', core)).toEqual({ kind: 'whole', itemId: 'item-1' });
    expect(enqueued()).toEqual(['item.revise']);
  });

  it('is stale for a key that is not a later rule occurrence', async () => {
    expect(await splitItem('item-1', '2026-08-12T17:00:00Z', core)).toEqual({ kind: 'stale' });
    expect(await splitItem('item-1', '2026-08-05T17:00:00Z', core)).toEqual({ kind: 'stale' });
    expect(fx.enqueue).not.toHaveBeenCalled();
  });

  it('is stale once the series is gone', async () => {
    fx.doc.mockResolvedValue(null);
    expect(await splitItem('item-1', '2026-08-17T17:00:00Z', core)).toEqual({ kind: 'stale' });
    expect(fx.enqueue).not.toHaveBeenCalled();
  });

  it('splits at a later occurrence and continues the series', async () => {
    const outcome = await splitItem('item-1', '2026-08-17T17:00:00Z', core);
    expect(outcome).toMatchObject({ kind: 'split' });
    expect(outcome.kind !== 'stale' && outcome.itemId).not.toBe('item-1');
    expect(enqueued()).toEqual(['item.split', 'item.continue']);
  });

  it('reads the series as it is now, not as the editor opened it', async () => {
    fx.doc.mockResolvedValue({ ...weekly, doc: { ...weekly.doc, recurrenceRule: 'FREQ=WEEKLY;COUNT=2' } });
    expect(await splitItem('item-1', '2026-08-17T17:00:00Z', core)).toEqual({ kind: 'stale' });
    expect(fx.enqueue).not.toHaveBeenCalled();
  });
});

describe('changeOccurrence', () => {
  it('changes an occurrence the series has', async () => {
    expect(await changeOccurrence('item-1', '2026-08-10T17:00:00Z', { kind: 'exclude' })).toBe(true);
    expect(enqueued()).toEqual(['item.occurrence']);
  });

  it('writes nothing for an occurrence the series no longer has', async () => {
    expect(await changeOccurrence('item-1', '2026-08-31T17:00:00Z', { kind: 'exclude' })).toBe(false);
    fx.doc.mockResolvedValue(null);
    expect(await changeOccurrence('item-1', '2026-08-10T17:00:00Z', { kind: 'restore' })).toBe(false);
    expect(fx.enqueue).not.toHaveBeenCalled();
  });
});

describe('deleteFollowing', () => {
  it('ends the series before a later occurrence', async () => {
    expect(await deleteFollowing('item-1', '2026-08-17T17:00:00Z')).toBe('deleted');
    const [split] = fx.enqueue.mock.calls.flatMap(([ops]) => ops as ClientOp[]);
    expect(split).toMatchObject({ kind: 'item.split', itemId: 'item-1', originalStart: '2026-08-17T17:00:00Z', core: null });
  });

  it('deletes the whole series from the first occurrence', async () => {
    expect(await deleteFollowing('item-1', '2026-08-03T17:00:00Z')).toBe('whole');
    expect(enqueued()).toEqual(['item.delete']);
  });

  it('deletes nothing at an occurrence the series no longer has', async () => {
    fx.doc.mockResolvedValue({ ...weekly, doc: { ...weekly.doc, recurrenceRule: 'FREQ=WEEKLY;COUNT=2' } });
    expect(await deleteFollowing('item-1', '2026-08-17T17:00:00Z')).toBe('gone');
    expect(await deleteFollowing('item-1', '2026-08-05T17:00:00Z')).toBe('gone');
    fx.doc.mockResolvedValue(null);
    expect(await deleteFollowing('item-1', '2026-08-17T17:00:00Z')).toBe('gone');
    expect(fx.enqueue).not.toHaveBeenCalled();
  });
});

describe('group membership', () => {
  it('queues an add and a remove on the group', async () => {
    await addToGroup('g-1', 'c-1');
    await removeFromGroup('g-1', 'c-1');
    const ops = fx.enqueue.mock.calls.flatMap(([ops]) => ops as ClientOp[]);
    expect(ops).toMatchObject([
      { kind: 'contact.group.addMember', aggregate: 'contact.group', aggregateId: 'g-1', groupId: 'g-1', contactId: 'c-1' },
      { kind: 'contact.group.removeMember', aggregate: 'contact.group', aggregateId: 'g-1', groupId: 'g-1', contactId: 'c-1' },
    ]);
  });
});
