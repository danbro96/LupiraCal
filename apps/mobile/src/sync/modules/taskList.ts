import { syncLists } from '@lupira/cal-api/fetch/tasks';
import type { ListDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { Aggregate } from '../../domain/aggregates';

export const taskListModule: AggregateModule<ListDto, null, never, ListDto> = {
  aggregate: Aggregate.taskList,
  feed: {
    fetch: (since) => syncLists(since ? { since } : undefined),
    fromWire: (l) => ({ id: l.id, state: { doc: l, guards: null } }),
  },
};
