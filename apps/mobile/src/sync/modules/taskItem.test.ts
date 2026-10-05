import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { TasksItemSyncChange } from '@lupira/cal-api/models';
import { beforeEach, describe, expect, it } from 'vitest';
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
  it('indexes open deadlines only, due normalized to UTC, and forgets tombstoned tasks', async () => {
    const e = createSyncEngine({ openDb: async () => db, modules: [module], cacheVersion: 1, onChange: () => {} });
    page = {
      changed: [
        task('due', { dueAt: '2026-08-10T18:00:00+02:00' }),
        task('done', { dueAt: '2026-08-10T18:00:00Z', status: 'Done', completed: true }),
        task('cancelled', { dueAt: '2026-08-10T18:00:00Z', status: 'Cancelled' }),
        task('undated', {}),
      ],
      deleted: [],
    };
    await e.sync();
    expect(await db.all('SELECT item_id, list_id, due FROM task_deadlines')).toEqual([
      { item_id: 'due', list_id: 'l1', due: '2026-08-10T16:00:00.000Z' },
    ]);

    page = { changed: [], deleted: ['due'] };
    await e.sync();
    expect(await db.all('SELECT * FROM task_deadlines')).toEqual([]);
  });
});
