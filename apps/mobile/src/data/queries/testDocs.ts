import type { Tx } from '@danbro96/lupira-expo-sqlite/types';

/** For query tests: the kernel's documented `docs` read surface, which the data layer may not import. */
export const DOCS_DDL = 'CREATE TABLE docs (aggregate TEXT NOT NULL, id TEXT NOT NULL, local TEXT, PRIMARY KEY (aggregate, id));';

export async function putDoc<S>(tx: Tx, aggregate: string, id: string, state: S, writeIndex: (tx: Tx, id: string, state: S) => Promise<void>): Promise<void> {
  await tx.run('INSERT OR REPLACE INTO docs (aggregate, id, local) VALUES (?, ?, ?)', [aggregate, id, JSON.stringify(state)]);
  await writeIndex(tx, id, state);
}
