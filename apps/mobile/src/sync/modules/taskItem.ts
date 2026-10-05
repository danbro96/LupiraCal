import { syncItems } from '@lupira/cal-api/fetch/tasks';
import type { ItemGuardsDto, ItemDto, TasksItemSyncChange } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { TASK_DDL, TASK_TABLES, writeTaskIndex } from '../../data/indexes/tasks';
import { Aggregate } from '../../domain/aggregates';

/** Read-only: task edits belong to Lupira Tasks. */
export const taskItemModule: AggregateModule<ItemDto, ItemGuardsDto, never, TasksItemSyncChange> = {
  aggregate: Aggregate.taskItem,
  feed: {
    fetch: (since) => syncItems(since ? { since } : undefined),
    fromWire: (c) => ({ id: c.item.id, state: { doc: c.item, guards: c.guards } }),
  },
  index: { version: 1, tables: TASK_TABLES, ddl: TASK_DDL, write: writeTaskIndex },
};
