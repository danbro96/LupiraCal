import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyItemGuards, type ItemDoc } from '../domain/docTypes';
import type { MirrorItem } from '../domain/mirrorReducers';
import type { ClientOp } from '../domain/ops';

const fx = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock('../sync/engine', () => ({ engine: { enqueue: fx.enqueue }, readyDb: async () => ({}) }));
vi.mock('../sync/holdKeys', () => ({ withHoldKeys: async (_db: unknown, ops: ClientOp[]) => ops }));
vi.mock('../data/queries/itemLineage', () => ({ lineageRoot: async (_db: unknown, id: string) => id }));
vi.mock('../data/ids', () => ({ deterministicIdFor: async (key: string) => `id-${key}` }));

const { splitItem } = await import('./actions');

const weekly: MirrorItem = {
  doc: {
    id: 'item-1', title: 'Training', isAllDay: false, startsAt: '2026-08-03T17:00:00Z', endsAt: '2026-08-03T18:00:00Z',
    recurrenceRule: 'FREQ=WEEKLY;COUNT=4', extraOccurrences: ['2026-08-05T17:00:00Z'], calendars: [{ calendarId: 'cal-1', status: 'Accepted' }],
  } as ItemDoc,
  guards: emptyItemGuards(),
};
const core = { title: 'New', isAllDay: false };
const enqueued = () => fx.enqueue.mock.calls.flatMap(([ops]) => ops as ClientOp[]).map((o) => o.kind);

beforeEach(() => fx.enqueue.mockReset());

describe('splitItem', () => {
  it('revises the whole series from the first occurrence', async () => {
    expect(await splitItem(weekly, '2026-08-03T17:00:00Z', core)).toBe('item-1');
    expect(enqueued()).toEqual(['item.revise']);
  });

  it('writes nothing for a key that is not a later rule occurrence', async () => {
    expect(await splitItem(weekly, '2026-08-12T17:00:00Z', core)).toBe('item-1');
    expect(await splitItem(weekly, '2026-08-05T17:00:00Z', core)).toBe('item-1');
    expect(fx.enqueue).not.toHaveBeenCalled();
  });

  it('splits at a later occurrence and continues the series', async () => {
    expect(await splitItem(weekly, '2026-08-17T17:00:00Z', core)).not.toBe('item-1');
    expect(enqueued()).toEqual(['item.split', 'item.continue']);
  });
});
