import { getSyncItems } from '@lupira/cal-api/fetch/cal';
import type { CalendarItemDto, ItemSyncChange } from '@lupira/cal-api/models';
import { instantList, occurrenceKey } from '@lupira/cal-domain/seriesOccurrences';
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
    fromWire: (c) => ({ id: c.item.id, state: { doc: itemDocOf(c.item), guards: c.guards } }),
  },
  reduce: applyItemOp,
  replay: replayOp,
  holdKeyOf: (op) => op.holdKey ?? op.aggregateId,
  index: { version: 7, tables: ITEM_TABLES, ddl: ITEM_DDL + BRIDGE_VIEW, write: writeItemIndex },
};

/** Occurrence identities arrive as any ISO offset; the mirror keeps them as occurrence keys. */
function itemDocOf(item: CalendarItemDto): ItemDoc {
  return {
    ...item,
    excludedOccurrences: instantList(item.excludedOccurrences),
    extraOccurrences: instantList(item.extraOccurrences),
    occurrenceOverrides: item.occurrenceOverrides?.length
      ? item.occurrenceOverrides.map((o) => ({ ...o, originalStart: occurrenceKey(o.originalStart) }))
      : null,
  } as ItemDoc;
}
