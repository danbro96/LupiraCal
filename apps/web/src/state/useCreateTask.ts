import { useMutation } from '@tanstack/react-query';
import { v7 as uuidv7 } from 'uuid';
import { createItemRelation } from '@lupira/cal-api/fetch/cal';
import { createListItem, listListItems } from '@lupira/cal-api/fetch/tasks';
import { newTaskBody, TASK_RELATION } from '@lupira/cal-domain/tasks';
import { useInvalidateItems, useInvalidateTasks } from './useInvalidate';

export type NewTask = { listId: string; title: string; dueDay: string | null; eventId?: string };

/** Adds a LupiraTasks task at the top of its list and, when made from an event, links the event to it. */
export function useCreateTask() {
  const invalidateTasks = useInvalidateTasks();
  const invalidateItems = useInvalidateItems();
  return useMutation({
    mutationFn: async ({ listId, title, dueDay, eventId }: NewTask) => {
      const task = await createListItem(listId, newTaskBody(uuidv7(), title, dueDay, await listListItems(listId)));
      if (eventId) await createItemRelation(eventId, { ...TASK_RELATION, toRef: task.id });
      return task;
    },
    onSettled: (_task, _error, { eventId }) => {
      void invalidateTasks();
      if (eventId) void invalidateItems();
    },
  });
}
