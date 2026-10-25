import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { detach } from '@danbro96/lupira-expo-diagnostics/log';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { v7 as uuidv7 } from 'uuid';
import { createItemRelation } from '@lupira/cal-api/fetch/cal';
import { createListItem, listListItems } from '@lupira/cal-api/fetch/tasks';
import type { ItemDto, ListDto } from '@lupira/cal-api/models';
import { initialTaskListId, newTaskBody, TASK_RELATION, writableTaskLists, type TaskListLike } from '@lupira/cal-domain/tasks';
import { Aggregate } from '../domain/aggregates';
import { engine } from '../sync/engine';
import { usePrefs } from './prefs-store';

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

export type TaskComposer = {
  lists: TaskListLike[];
  listId: string;
  setListId: (id: string) => void;
  dueDay: string;
  setDueDay: (day: string) => void;
  /** Why a task can't be added right now; null when it can. */
  blocker: string | null;
  save: (title: string, eventId?: string) => Promise<void>;
};

export function useTaskComposer(initialDueDay: string): TaskComposer {
  const online = useOnline();
  const { data: lists, isLoading } = useWritableTaskLists();
  const lastTaskListId = usePrefs((p) => p.lastTaskListId);
  const setLastTaskListId = usePrefs((p) => p.setLastTaskListId);
  const [pickedListId, setListId] = useState<string | null>(null);
  const [dueDay, setDueDay] = useState(initialDueDay);
  const listId = pickedListId ?? (lists ? initialTaskListId(lists, lastTaskListId) : '');
  const blocker = !online
    ? 'Needs a connection to add a task.'
    : isLoading || !lists
      ? 'Loading…'
      : !lists.length ? 'No task list you can add to. Create one in Lupira Tasks.' : null;
  const save = async (title: string, eventId?: string) => {
    await createTask({ listId, title, dueDay: dueDay || null, eventId });
    detach(setLastTaskListId(listId), 'prefs:lastTaskList');
  };
  return { lists: lists ?? [], listId, setListId, dueDay, setDueDay, blocker, save };
}
