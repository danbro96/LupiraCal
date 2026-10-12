import { useListLists } from '@lupira/cal-api/query/tasks';
import { writableTaskLists } from '@lupira/cal-domain/tasks';

export function useWritableTaskLists(enabled = true) {
  const { data, isLoading } = useListLists(undefined, { query: { enabled, select: writableTaskLists } });
  return { lists: data ?? [], isLoading };
}
