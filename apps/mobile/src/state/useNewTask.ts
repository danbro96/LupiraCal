import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { v7 as uuidv7 } from 'uuid';
import { createItemRelation } from '@lupira/cal-api/fetch/cal';
import { createListItem, listListItems } from '@lupira/cal-api/fetch/tasks';
import type { ItemDto, ListDto } from '@lupira/cal-api/models';
import { newTaskBody, TASK_RELATION, writableTaskLists } from '@lupira/cal-domain/tasks';
import { Aggregate } from '../domain/aggregates';
import { engine } from '../sync/engine';

export type NewTask = { listId: string; title: string; dueDay: string | null; eventId?: string };

export function useWritableTaskLists() {
  return useQuery(mirrorQuery([Aggregate.taskList, 'writable'], async () =>
    writableTaskLists((await engine.docs<ListDto, null>(Aggregate.taskList)).map((d) => d.state.doc))));
}

/** Online-only: task edits belong to Lupira Tasks, so there is no op to queue; the sync after it pulls the task
 *  into the mirror. From an event, the event is linked to the new task. */
export async function createTask({ listId, title, dueDay, eventId }: NewTask): Promise<ItemDto> {
  const task = await createListItem(listId, newTaskBody(uuidv7(), title, dueDay, await listListItems(listId)));
  if (eventId) await createItemRelation(eventId, { ...TASK_RELATION, toRef: task.id });
  engine.sync();
  return task;
}
