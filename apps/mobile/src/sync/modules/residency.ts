import { getResidencyChanges } from '@lupira/cal-api/fetch/contact';
import type { ResidencyDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { RESIDENCY_DDL, RESIDENCY_TABLES, writeResidencyIndex } from '../../data/indexes/residencies';
import { Aggregate } from '../../domain/aggregates';
import type { ResidencyDoc } from '../../domain/docTypes';
import { applyResidencyOp } from '../../domain/mirrorReducers';
import type { ClientOp } from '../../domain/ops';
import { replayOp } from '../replayOp';

export const residencyModule: AggregateModule<ResidencyDoc, null, ClientOp, ResidencyDto> = {
  aggregate: Aggregate.residency,
  feed: {
    fetch: (since) => getResidencyChanges(since ? { since } : undefined),
    fromWire: (r) => ({ id: r.id, state: { doc: r, guards: null } }),
  },
  reduce: applyResidencyOp,
  replay: replayOp,
  // Shares the contact's hold key, so an address added to a contact created offline waits for that create.
  holdKeyOf: (op) => ('contactId' in op ? op.contactId : op.aggregateId),
  index: { version: 2, tables: RESIDENCY_TABLES, ddl: RESIDENCY_DDL, write: writeResidencyIndex },
};
