import { describe, expect, it } from 'vitest';
import { ymd } from './time';
import { dueDay, dueLine, isOpenDeadline, isOverdue, isTaskOverdue, monthUtcRange, taskDeepLink, taskWebUrl, type TaskLike } from './tasks';

const task = (over: Partial<TaskLike>): TaskLike => ({
  id: 'i1',
  listId: 'l1',
  title: 'Renew passport',
  dueAt: '2026-08-15T10:00:00+02:00',
  status: 'Open',
  ...over,
});

describe('isOpenDeadline', () => {
  it('drops undated and Cancelled tasks, keeps the rest', () => {
    expect(isOpenDeadline(task({ dueAt: null }))).toBe(false);
    expect(isOpenDeadline(task({ dueAt: undefined }))).toBe(false);
    expect(isOpenDeadline(task({ status: 'Cancelled' }))).toBe(false);
    expect(isOpenDeadline(task({}))).toBe(true);
  });
});

describe('dueDay', () => {
  it('is the LOCAL day of dueAt', () => {
    const local = new Date(2026, 7, 15, 23, 30);
    expect(dueDay(local.toISOString())).toBe(ymd(local));
  });
});

describe('isOverdue', () => {
  it('is strict: due exactly now is not overdue', () => {
    const due = new Date(2026, 7, 15, 12, 0);
    expect(isOverdue(due.toISOString(), new Date(2026, 7, 15, 11, 59))).toBe(false);
    expect(isOverdue(due.toISOString(), due)).toBe(false);
    expect(isOverdue(due.toISOString(), new Date(2026, 7, 15, 12, 1))).toBe(true);
  });
});

describe('monthUtcRange', () => {
  it('spans the local month half-open', () => {
    const { dueFrom, dueTo } = monthUtcRange('2026-08');
    expect(dueFrom).toBe(new Date(2026, 7, 1).toISOString());
    expect(dueTo).toBe(new Date(2026, 8, 1).toISOString());
  });

  it('rolls the year at December', () => {
    expect(monthUtcRange('2026-12').dueTo).toBe(new Date(2027, 0, 1).toISOString());
  });
});

describe('links', () => {
  it('build the tasks-app route and the web fallback', () => {
    expect(taskDeepLink('l1', 'i1')).toBe('lupiratasks://task/l1/i1');
    expect(taskWebUrl('l1')).toBe('https://tasks.lupira.com/lists/l1');
  });
});

describe('dueLine', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  it('says when, flags an open task past it, and nothing for a done one', () => {
    expect(dueLine({ dueAt: '2026-10-01T10:00:00Z' }, now)).toMatch(/^Due .* — overdue$/);
    expect(dueLine({ dueAt: '2026-10-01T10:00:00Z', completed: true }, now)).not.toMatch(/overdue/);
    expect(dueLine({ dueAt: null }, now)).toBe('No deadline');
    expect(isTaskOverdue({ dueAt: '2026-10-09T10:00:00Z' }, now)).toBe(false);
  });
});

