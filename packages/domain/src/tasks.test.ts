import { describe, expect, it } from 'vitest';
import { fmtDate, ymd } from '@danbro96/lupira-domain-core/time';
import {
  dueDay, dueFromPick, dueLine, initialTaskListId, isOpenDeadline, isOverdue, isTaskOverdue, monthDayRange, newTaskBody,
  newTaskSortOrder, taskDeepLink, taskWebUrl, writableTaskLists, type TaskLike, type TaskListLike,
} from './tasks';

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
    expect(isOpenDeadline(task({ dueAt: null, dueOn: '2026-08-15' }))).toBe(true);
  });
});

describe('dueDay', () => {
  it('is the LOCAL day of dueAt', () => {
    const local = new Date(2026, 7, 15, 23, 30);
    expect(dueDay({ dueAt: local.toISOString() })).toBe(ymd(local));
  });

  it('is dueOn itself for a date-only due', () => {
    expect(dueDay({ dueOn: '2026-08-15' })).toBe('2026-08-15');
  });
});

describe('isOverdue', () => {
  it('is strict for a timed due: due exactly now is not overdue', () => {
    const due = new Date(2026, 7, 15, 12, 0);
    expect(isOverdue({ dueAt: due.toISOString() }, new Date(2026, 7, 15, 11, 59))).toBe(false);
    expect(isOverdue({ dueAt: due.toISOString() }, due)).toBe(false);
    expect(isOverdue({ dueAt: due.toISOString() }, new Date(2026, 7, 15, 12, 1))).toBe(true);
  });

  it('holds a date-only due through its whole local day', () => {
    expect(isOverdue({ dueOn: '2026-08-15' }, new Date(2026, 7, 15, 23, 59))).toBe(false);
    expect(isOverdue({ dueOn: '2026-08-15' }, new Date(2026, 7, 16, 0, 0))).toBe(true);
  });
});

describe('monthDayRange', () => {
  it('spans the month half-open', () => {
    expect(monthDayRange('2026-08')).toEqual({ fromDay: '2026-08-01', toDay: '2026-09-01' });
  });

  it('rolls the year at December', () => {
    expect(monthDayRange('2026-12').toDay).toBe('2027-01-01');
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

  it('gives a date-only due its date alone', () => {
    expect(dueLine({ dueOn: '2026-10-04' }, now)).toBe(`Due ${fmtDate(new Date(2026, 9, 4))}`);
    expect(dueLine({ dueOn: '2026-10-03' }, now)).toMatch(/ — overdue$/);
  });
});


const list = (over: Partial<TaskListLike>): TaskListLike => ({ id: 'l', name: 'L', access: 'Owner', isArchived: false, ...over });

describe('writableTaskLists', () => {
  it('drops archived and view-only lists', () => {
    const lists = [list({ id: 'a' }), list({ id: 'b', isArchived: true }), list({ id: 'c', access: 'Viewer' }), list({ id: 'd', access: 'Editor' })];
    expect(writableTaskLists(lists).map((l) => l.id)).toEqual(['a', 'd']);
  });

  it('orders keyed lists first, the rest by name', () => {
    const lists = [list({ id: 'z', name: 'Zeta' }), list({ id: 'k2', sortOrder: 'a1' }), list({ id: 'a', name: 'Alpha' }), list({ id: 'k1', sortOrder: 'a0' })];
    expect(writableTaskLists(lists).map((l) => l.id)).toEqual(['k1', 'k2', 'a', 'z']);
  });
});

describe('initialTaskListId', () => {
  it('keeps the remembered list while offered, else the first', () => {
    const lists = [list({ id: 'a' }), list({ id: 'b' })];
    expect(initialTaskListId(lists, 'b')).toBe('b');
    expect(initialTaskListId(lists, 'gone')).toBe('a');
    expect(initialTaskListId([], 'b')).toBe('');
  });
});

describe('dueFromPick', () => {
  it('makes a day alone date-only and a day with a time a local instant', () => {
    expect(dueFromPick(null, '09:00')).toEqual({ dueOn: null, dueAt: null });
    expect(dueFromPick('2026-10-12', null)).toEqual({ dueOn: '2026-10-12', dueAt: null });
    expect(dueFromPick('2026-10-12', '18:30')).toEqual({ dueOn: null, dueAt: new Date(2026, 9, 12, 18, 30).toISOString() });
  });
});

describe('newTaskSortOrder', () => {
  it('sorts before every top-level task, ignoring subtasks', () => {
    const key = newTaskSortOrder([{ sortOrder: 'a1' }, { sortOrder: 'a0', parentItemId: null }, { sortOrder: 'Zz', parentItemId: 'p' }]);
    expect(key < 'a0').toBe(true);
  });

  it('starts an empty list', () => {
    expect(newTaskSortOrder([])).toBe('a0');
  });
});

describe('newTaskBody', () => {
  it('trims the title and leaves an undated task without a due', () => {
    expect(newTaskBody('id', '  Pack  ', { day: null, time: null }, [])).toEqual({ id: 'id', title: 'Pack', dueOn: null, dueAt: null, sortOrder: 'a0' });
  });

  it('sends a picked day as dueOn', () => {
    expect(newTaskBody('id', 'Pack', { day: '2026-10-12', time: null }, [])).toMatchObject({ dueOn: '2026-10-12', dueAt: null });
  });
});
