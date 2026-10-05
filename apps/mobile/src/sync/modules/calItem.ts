import { getSyncItems } from '@lupira/cal-api/fetch/cal';
import type { ItemSyncChange } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { ITEM_DDL, ITEM_TABLES, writeItemIndex } from '../../data/indexes/items';
import { Aggregate } from '../../domain/aggregates';
import type { ItemDoc, ItemGuards } from '../../domain/docTypes';
import { applyItemOp } from '../../domain/mirrorReducers';
import type { ClientOp } from '../../domain/ops';
import { replayOp } from '../replayOp';

/** What the stock Calendar app gets; MirrorReader.kt reads these columns. */
const BRIDGE_VIEW = `
  DROP VIEW IF EXISTS bridge_items;
  CREATE VIEW bridge_items AS SELECT id, local AS state FROM docs WHERE aggregate = '${Aggregate.item}' AND local IS NOT NULL;
`;

export const calItemModule: AggregateModule<ItemDoc, ItemGuards, ClientOp, ItemSyncChange> = {
  aggregate: Aggregate.item,
  feed: {
    fetch: (since) => getSyncItems(since ? { since } : undefined),
    fromWire: (c) => ({ id: c.item.id, state: { doc: { ...c.item }, guards: c.guards } }),
  },
  reduce: applyItemOp,
  replay: replayOp,
  index: { version: 1, tables: ITEM_TABLES, ddl: ITEM_DDL + BRIDGE_VIEW, write: writeItemIndex },
};
