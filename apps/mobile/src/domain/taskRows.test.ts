import { describe, expect, it } from 'vitest';
import { ymd } from '@danbro96/lupira-domain-core/time';
import type { TaskLike } from '@lupira/cal-domain/tasks';
import { isTaskRow, taskDeadlineRows } from './taskRows';

const task = (over: Partial<TaskLike>): TaskLike => ({
  id: 'i1',
  listId: 'l1',
  title: 'Renew passport',
  dueAt: '2026-08-15T10:00:00+02:00',
  status: 'Open',
  ...over,
});

describe('taskDeadlineRows', () => {
  it('shapes an open deadline as an all-day mirror row on its LOCAL due day', () => {
    const local = new Date(2026, 7, 15, 23, 30);
    const rows = taskDeadlineRows([task({ dueAt: local.toISOString() })], new Date(2026, 7, 1));
    expect(rows).toHaveLength(1);
    expect(rows[0].start_day).toBe(ymd(local));
    expect(rows[0].all_day).toBe(1);
    expect(rows[0].start_utc).toBe(local.toISOString());
    expect(rows[0].task).toEqual({ listId: 'l1', itemId: 'i1', dueAt: local.toISOString(), overdue: false });
  });

  it('applies the shared open-deadline rule', () => {
    const rows = taskDeadlineRows(
      [task({ id: 'a', dueAt: null }), task({ id: 'b', status: 'Cancelled' }), task({ id: 'c' })],
      new Date(),
    );
    expect(rows.map((r) => r.source_id)).toEqual(['c']);
  });
});

describe('isTaskRow', () => {
  it('narrows on source', () => {
    const row = taskDeadlineRows([task({})], new Date())[0];
    expect(isTaskRow(row)).toBe(true);
    expect(isTaskRow({ source: 'item' })).toBe(false);
  });
});
