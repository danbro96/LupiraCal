import { useAllContactGroups } from '../../../state/useContactGroups';

/** Resolve a group by id. No get-by-id endpoint exists, so it is picked from every book's group list. */
export function useGroup(groupId: string | undefined) {
  const { groups, isLoading } = useAllContactGroups();
  return { group: groups.find((g) => g.id === groupId), isLoading };
}
