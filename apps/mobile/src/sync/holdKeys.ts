import type { Tx } from '@danbro96/lupira-expo-sqlite/types';
import { lineageRoot } from '../data/queries/itemLineage';
import { Aggregate } from '../domain/aggregates';
import type { ClientOp } from '../domain/ops';

/** Ops on a series an unconfirmed split is creating wait behind that split: they take its series' hold key. */
export async function withHoldKeys(tx: Tx, ops: ClientOp[]): Promise<ClientOp[]> {
  const out: ClientOp[] = [];
  for (const op of ops) {
    const root = op.aggregate === Aggregate.item && !op.holdKey ? await lineageRoot(tx, op.aggregateId) : op.aggregateId;
    out.push(root === op.aggregateId ? op : { ...op, holdKey: root });
  }
  return out;
}
