import { useQueries } from '@tanstack/react-query';
import { getListContactGroupsQueryOptions } from '@lupira/cal-api/query/contact';
import type { ContactGroupDto } from '@lupira/cal-api/models';
import { useAddressBooks } from './useAddressBooks';

/** Every readable book's groups, one list per book (the tree's per-book caches). contact-api has no cross-book group list. */
export function useAllContactGroups(): { groups: ContactGroupDto[]; isLoading: boolean } {
  const { addressBooks, isLoading: booksLoading } = useAddressBooks();
  const results = useQueries({ queries: addressBooks.map((b) => getListContactGroupsQueryOptions(b.id)) });
  return {
    groups: results.flatMap((r) => r.data ?? []),
    isLoading: booksLoading || results.some((r) => r.isLoading),
  };
}
