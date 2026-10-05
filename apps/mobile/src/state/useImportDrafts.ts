import { useOnline } from '@danbro96/lupira-expo-query/online';
import { useQuery } from '@tanstack/react-query';
import { draftsFor, readImportFile, type ImportKind } from '../data/imports';

/** The drafts in a shared file; reading them needs the server, so the query waits for a connection. */
export function useImportDrafts(kind: ImportKind, file: string) {
  const online = useOnline();
  const query = useQuery({
    queryKey: ['import', kind, file],
    queryFn: async () => draftsFor(kind, await readImportFile(file)),
    enabled: online,
    retry: false,
    staleTime: Infinity,
  });
  return { ...query, online };
}
