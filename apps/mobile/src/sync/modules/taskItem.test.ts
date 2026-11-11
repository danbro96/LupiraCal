import { ymd } from '@danbro96/lupira-domain-core/time';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { TasksItemSyncChange } from '@lupira/cal-api/models';
import { beforeEach, describe, expect, it } from 'vitest';
import { taskDeadlinesBetween } from '../../data/queries/tasks';
import { taskItemModule } from './taskItem';

const task = (id: string, over: Record<string, unknown>) =>
  ({ item: { id, listId: 'l1', title: `Task ${id}`, status: 'Open', completed: false, ...over }, guards: {} }) as unknown as TasksItemSyncChange;

let db: Db;
let page: { changed: TasksItemSyncChange[]; deleted: string[] };

const module = {
  ...taskItemModule,
  feed: { ...taskItemModule.feed, fetch: async () => ({ cursor: 'c', hasMore: false, reset: false, ...page }) },
};

beforeEach(() => {
  db = openNodeDb();
});

describe('taskItem module', () => {
  it('indexes open deadlines only on their due day, a timed due normalized to UTC, and forgets tombstoned tasks', async () => {
    const e = createSyncEngine({ openDb: async () => db, modules: [module], cacheVersion: 1, onChange: () => {} });
    page = {
      changed: [
        task('due', { dueAt: '2026-08-10T18:00:00+02:00' }),
        task('dayOnly', { dueOn: '2026-08-12' }),
        task('done', { dueAt: '2026-08-10T18:00:00Z', status: 'Done', completed: true }),
        task('cancelled', { dueAt: '2026-08-10T18:00:00Z', status: 'Cancelled' }),
        task('undated', {}),
      ],
      deleted: [],
    };
    await e.sync();
    expect(await db.all('SELECT item_id, list_id, due_day, due_on, due_at FROM task_deadlines ORDER BY item_id')).toEqual([
      { item_id: 'dayOnly', list_id: 'l1', due_day: '2026-08-12', due_on: '2026-08-12', due_at: null },
      { item_id: 'due', list_id: 'l1', due_day: ymd(new Date('2026-08-10T16:00:00Z')), due_on: null, due_at: '2026-08-10T16:00:00.000Z' },
    ]);
    expect((await taskDeadlinesBetween(db, '2026-08-11', '2026-08-13')).map((t) => [t.id, t.dueOn, t.dueAt])).toEqual([['dayOnly', '2026-08-12', null]]);

    page = { changed: [], deleted: ['due', 'dayOnly'] };
    await e.sync();
    expect(await db.all('SELECT * FROM task_deadlines')).toEqual([]);
  });
});
